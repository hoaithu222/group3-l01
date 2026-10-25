import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { advance, errorOf, HOST, makeHarness, newSession } from "./support/quiz-harness";
import { oid, userOf } from "./support/quiz-fakes";

/** Kick, cron dọn phiên treo (`live-quiz.expire-stale`), thao tác/xem của admin (be.md §4/§7). */
describe("kick", () => {
  it("host mời người chơi ra: rút khỏi room, phát lobby không còn người đó, bỏ khỏi bảng điểm; không vào lại được", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 3 });
    await h.emitter.flush();
    h.emitter.clear();
    await h.service.kick(s.host, s.id, s.playerIds[1]);
    await h.emitter.flush();
    expect(h.emitter.of("leave")[0].payload.userIds).toEqual([s.playerIds[1]]);
    const [lobby] = h.emitter.of("lobby");
    expect(lobby.payload.players.map((p) => p.userId)).toEqual([s.playerIds[0], s.playerIds[2]]);
    expect(lobby.payload).not.toHaveProperty("pin");
    expect((await s.snap()).leaderboardTop.map((r) => r.userId)).not.toContain(s.playerIds[1]);
    expect(await h.service.isParticipant(s.playerIds[1], s.id)).toBe(false);
  });

  it("không tự mời mình (QUIZ_007); mời người không có trong phòng → QUIZ_001", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    expect((await errorOf(h.service.kick(s.host, s.id, HOST))).errorCode).toBe(ErrorCode.QUIZ_007);
    expect((await errorOf(h.service.kick(s.host, s.id, oid(999)))).errorCode).toBe(ErrorCode.QUIZ_001);
  });
});

describe("expireStale (cron live-quiz.expire-stale)", () => {
  const minutes = (n: number) => new Date(Date.now() - n * 60_000);

  it("WAITING quá staleWaitingMinutes và IN_PROGRESS không hoạt động quá staleInProgressMinutes → CANCELLED/EXPIRED; phiên còn mới giữ nguyên", async () => {
    const h = makeHarness();
    h.clock.set(Date.now());
    const waiting = await newSession(h, { playerCount: 1 });
    const running = await newSession(h, { playerCount: 1 });
    await advance(h, running, "start");
    const fresh = await newSession(h, { playerCount: 1 });
    h.repo.patch(waiting.id, { updatedAt: minutes(LIMITS.liveQuiz.staleWaitingMinutes + 1) });
    h.repo.patch(running.id, { updatedAt: minutes(LIMITS.liveQuiz.staleInProgressMinutes + 1) });
    expect(await h.service.expireStale()).toBe(2);
    for (const s of [waiting, running]) expect(await h.repo.findById(s.id)).toMatchObject({ status: "CANCELLED", endReason: "EXPIRED" });
    expect((await h.repo.findById(fresh.id))?.status).toBe("WAITING");
    expect(h.emitter.of("ended").map((e) => e.payload.reason)).toEqual(["EXPIRED", "EXPIRED"]);
    expect(await h.service.expireStale()).toBe(0); // lần sau không còn gì
  });

  it("WAITING mới hơn ngưỡng của WAITING nhưng IN_PROGRESS dùng ngưỡng NGẮN hơn (30 phút) — không nhầm ngưỡng", async () => {
    const h = makeHarness();
    h.clock.set(Date.now());
    const waiting = await newSession(h, { playerCount: 1 });
    const running = await newSession(h, { playerCount: 1 });
    await advance(h, running, "start");
    h.repo.patch(waiting.id, { updatedAt: minutes(LIMITS.liveQuiz.staleInProgressMinutes + 5) }); // 35' < 120' → còn hạn
    h.repo.patch(running.id, { updatedAt: minutes(LIMITS.liveQuiz.staleInProgressMinutes + 5) }); // 35' > 30' → quá hạn
    expect(await h.service.expireStale()).toBe(1);
    expect((await h.repo.findById(waiting.id))?.status).toBe("WAITING");
    expect((await h.repo.findById(running.id))?.status).toBe("CANCELLED");
  });

  it("khoá Redis đã mất → chỉ CAS Mongo (vẫn đóng được, không ném lỗi)", async () => {
    const h = makeHarness();
    h.clock.set(Date.now());
    const s = await newSession(h, { playerCount: 1 });
    h.store.drop(s.id);
    h.repo.patch(s.id, { updatedAt: minutes(LIMITS.liveQuiz.staleWaitingMinutes + 1) });
    expect(await h.service.expireStale()).toBe(1);
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "CANCELLED", endReason: "EXPIRED" });
  });
});

describe("admin", () => {
  const admin = userOf(oid(7), "admin");

  it("adminEnd: huỷ phiên đang mở (CANCELLED, ADMIN_ENDED), phát quiz:ended, ghi audit live-quiz.admin-end kèm lý do; không phát XP", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 2 });
    await advance(h, s, "start");
    expect(await h.service.adminEnd(admin, s.id, "Vi phạm nội quy phòng thi")).toEqual({ status: "CANCELLED" });
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "CANCELLED", endReason: "ADMIN_ENDED" });
    expect(h.emitter.of("ended")[0].payload).toMatchObject({ status: "CANCELLED", reason: "ADMIN_ENDED" });
    expect(h.outbox.events).toHaveLength(0);
    expect(h.audit.records).toEqual([
      expect.objectContaining({ actorId: admin.id, action: "live-quiz.admin-end", targetType: "LiveQuizSession", targetId: s.id, reason: "Vi phạm nội quy phòng thi" }),
    ]);
  });

  it("adminEnd: phiên đã đóng → QUIZ_007; không tồn tại → QUIZ_001; Redis đã mất vẫn đóng được ở Mongo", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    await h.service.end(s.host, s.id, 1, true);
    expect((await errorOf(h.service.adminEnd(admin, s.id, "lý do đủ dài"))).errorCode).toBe(ErrorCode.QUIZ_007);
    expect((await errorOf(h.service.adminEnd(admin, oid(4242), "lý do đủ dài"))).errorCode).toBe(ErrorCode.QUIZ_001);
    expect(h.audit.records).toHaveLength(0);
    const lost = await newSession(h, { playerCount: 1 });
    h.store.drop(lost.id);
    expect(await h.service.adminEnd(admin, lost.id, "dọn phiên mồ côi")).toEqual({ status: "CANCELLED" });
    expect((await h.repo.findById(lost.id))?.endReason).toBe("ADMIN_ENDED");
  });

  it("adminList/adminGet chỉ có metadata: KHÔNG PIN, KHÔNG đáp án; lọc theo trạng thái; adminGet kèm bảng kết quả bền", async () => {
    const h = makeHarness();
    const done = await newSession(h, { playerCount: 1, questions: 1 });
    await advance(h, done, "start");
    await h.service.answer(done.player(0), done.id, 0, 0);
    await h.service.end(done.host, done.id, (await done.snap()).version, false);
    await h.service.persistResults(done.id);
    await newSession(h, { playerCount: 0 });
    const all = await h.service.adminList({ page: 1, limit: 10 });
    expect(all.total).toBe(2);
    expect(JSON.stringify(all.items)).not.toContain(done.pin);
    const onlyFinished = await h.service.adminList({ page: 1, limit: 10, status: "FINISHED" });
    expect(onlyFinished.items).toEqual([expect.objectContaining({ id: done.id, status: "FINISHED", total: 1, playersCount: 1, hostId: HOST })]);
    const detail = (await h.service.adminGet(done.id)) as { results: Array<Record<string, unknown>> };
    expect(detail.results).toEqual([expect.objectContaining({ userId: done.playerIds[0], rank: 1, score: 1500 })]);
    expect(detail.results[0]).not.toHaveProperty("answers");
    expect((await errorOf(h.service.adminGet(oid(4242)))).errorCode).toBe(ErrorCode.QUIZ_001);
  });
});
