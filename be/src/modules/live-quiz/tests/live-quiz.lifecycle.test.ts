import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { HOST, advance, errorOf, makeHarness, newSession } from "./support/quiz-harness";
import { oid, userOf } from "./support/quiz-fakes";

/**
 * Vòng đời phiên (be.md §5, README §8): tạo → vào phòng bằng PIN → start/next → kết thúc; CAS `version` (LQ-05), sảnh đầy (LQ-06),
 * quyền host/người chơi/người ngoài, `quiz:question` không lộ đáp án (LQ-03).
 */
describe("create", () => {
  it("trả PIN 6 số, phiên WAITING version 1; Redis giữ PIN → sessionId; hàng Mongo ghi null tường minh", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 0 });
    expect(s.pin).toMatch(/^\d{6}$/);
    expect(await h.store.resolvePin(s.pin)).toBe(s.id);
    const row = await h.repo.findById(s.id);
    expect(row).toMatchObject({ status: "WAITING", version: 1, hostId: HOST, currentIndex: -1, resultsPersistedAt: null, endedAt: null, endReason: null, startedAt: null });
    expect(row?.setTitle).toBe("Bộ thử");
    expect(row?.questionOrder).toHaveLength(3);
  });

  it("bộ không đủ câu trắc nghiệm → QUIZ_006 (400)", async () => {
    const h = makeHarness();
    const setId = h.content.addSet(HOST, () => []);
    const err = await errorOf(h.service.create(userOf(HOST), { setId, count: 1, secondsPerQuestion: 20, shuffle: false, autoAdvance: false }));
    expect([err.errorCode, err.statusCode]).toEqual([ErrorCode.QUIZ_006, 400]);
  });

  it("bộ không đọc được (của người khác) → 404, không tạo phiên", async () => {
    const h = makeHarness();
    const setId = h.content.addSet(oid(77), () => []);
    const err = await errorOf(h.service.create(userOf(HOST), { setId, count: 1, secondsPerQuestion: 20, shuffle: false, autoAdvance: false }));
    expect(err.statusCode).toBe(404);
    expect((await h.repo.adminList({ page: 1, limit: 10 })).total).toBe(0);
  });

  it("phiên gắn workspace: người không phải thành viên (hoặc khách) → 403", async () => {
    const h = makeHarness();
    const setId = h.content.addSet(HOST, () => []);
    const err = await errorOf(h.service.create(userOf(HOST), { setId, count: 1, secondsPerQuestion: 20, shuffle: false, autoAdvance: false, workspaceId: oid(500) }));
    expect([err.statusCode, err.errorCode]).toEqual([403, ErrorCode.PERM_001]);
  });
});

describe("join", () => {
  it("người chơi nhận snapshot KHÔNG có pin; host nhận pin; lobby phát cả phòng KHÔNG chứa pin", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 0 });
    const res = await h.service.join(userOf(oid(100)), { pin: s.pin, nickname: "Bạn A" });
    expect(res.sessionId).toBe(s.id);
    expect(res.snapshot).not.toHaveProperty("pin");
    expect(res.snapshot.players).toEqual([{ userId: oid(100), nickname: "Bạn A", avatarAssetId: null }]);
    expect((await s.snap()).pin).toBe(s.pin);

    await h.emitter.flush();
    const [lobby] = h.emitter.of("lobby");
    expect(lobby.to).toBe(`quiz:${s.id}`);
    expect(lobby.payload).not.toHaveProperty("pin");
    expect(lobby.payload).toMatchObject({ sessionId: s.id, playersCount: 1 });
    expect(JSON.stringify(lobby.payload)).not.toContain(s.pin);
  });

  it("nickname mặc định lấy từ hồ sơ; vào lại cùng tài khoản là idempotent (không nhân đôi, không phát lobby lần nữa)", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    await h.service.join(s.player(0), { pin: s.pin });
    await h.emitter.flush();
    expect(h.emitter.of("lobby")).toHaveLength(1);
    expect((await s.snap()).players).toEqual([expect.objectContaining({ userId: s.playerIds[0], nickname: expect.stringContaining("Người") })]);
  });

  it("PIN sai/hết hạn → QUIZ_001 (404)", async () => {
    const h = makeHarness();
    const err = await errorOf(h.service.join(userOf(oid(100)), { pin: "000000" }));
    expect([err.errorCode, err.statusCode]).toEqual([ErrorCode.QUIZ_001, 404]);
  });

  it("LQ-06: người thứ 101 nhận QUIZ_003 (409), người cũ vào lại vẫn được", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: LIMITS.liveQuiz.playersMax });
    const err = await errorOf(h.service.join(userOf(oid(9000)), { pin: s.pin }));
    expect([err.errorCode, err.statusCode]).toEqual([ErrorCode.QUIZ_003, 409]);
    await expect(h.service.join(s.player(0), { pin: s.pin })).resolves.toBeDefined();
  });

  it("phiên workspace: người ngoài nhóm → 403; thành viên MEMBER vào được", async () => {
    const h = makeHarness();
    const ws = oid(500);
    h.workspaces.grant(ws, HOST, "OWNER");
    h.workspaces.grant(ws, oid(100), "MEMBER");
    const s = await newSession(h, { playerCount: 0, workspaceId: ws });
    const outsider = await errorOf(h.service.join(userOf(oid(101)), { pin: s.pin }));
    expect([outsider.statusCode, outsider.errorCode]).toEqual([403, ErrorCode.PERM_001]);
    await expect(h.service.join(userOf(oid(100)), { pin: s.pin })).resolves.toBeDefined();
  });

  it("phiên đã kết thúc → PIN không còn (QUIZ_001); người bị mời ra không vào lại được (QUIZ_010, 403)", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 2 });
    await h.service.kick(s.host, s.id, s.playerIds[0]);
    const kicked = await errorOf(h.service.join(s.player(0), { pin: s.pin }));
    expect([kicked.errorCode, kicked.statusCode]).toEqual([ErrorCode.QUIZ_010, 403]);
    await h.service.end(s.host, s.id, (await s.snap()).version, true);
    expect((await errorOf(h.service.join(userOf(oid(300)), { pin: s.pin }))).errorCode).toBe(ErrorCode.QUIZ_001);
  });
});

describe("get / isParticipant — chỉ host và người đã vào phòng", () => {
  it("người ngoài phiên → 404 QUIZ_001 (không lộ phiên tồn tại); guard room chỉ cho host + người chơi", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    expect((await errorOf(h.service.get(userOf(oid(999)), s.id))).errorCode).toBe(ErrorCode.QUIZ_001);
    expect(await h.service.isParticipant(HOST, s.id)).toBe(true);
    expect(await h.service.isParticipant(s.playerIds[0], s.id)).toBe(true);
    expect(await h.service.isParticipant(oid(999), s.id)).toBe(false);
    expect(await h.service.isParticipant(HOST, oid(12345))).toBe(false);
  });
});

describe("start / next", () => {
  it("start: IN_PROGRESS + `quiz:question` không lộ đáp án/giải thích (LQ-03), mang serverNow + questionStartedAt", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    const snap = await advance(h, s, "start");
    expect(snap).toMatchObject({ status: "IN_PROGRESS", phase: "QUESTION", currentIndex: 0, version: 2 });
    const [q] = h.emitter.of("question");
    expect(q.payload).toMatchObject({ sessionId: s.id, index: 0, total: 3, version: 2, serverNow: h.clock.t });
    expect(q.payload.deadlineAt - q.payload.questionStartedAt).toBe(20_000);
    const wire = JSON.stringify(q.payload);
    for (const banned of ["correct", "explanation", "Giải thích", "correctOptionIds", "itemId"]) expect(wire).not.toContain(banned);
    expect(JSON.stringify(snap.question)).not.toContain("Giải thích");
    expect(h.scheduler.last("close")).toMatchObject({ cmd: { type: "close", sessionId: s.id, index: 0 }, delayMs: 20_000 + LIMITS.liveQuiz.answerGraceMs });
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "IN_PROGRESS", currentIndex: 0, version: 2 });
  });

  it("hẹn lệnh đóng câu theo đồng hồ REDIS (deadline − started + grace), không theo Date.now() của API — máy API lệch 5 giây vẫn đúng hạn", async () => {
    for (const skew of [0, 5_000, -5_000]) {
      const h = makeHarness({ storeClockSkewMs: skew });
      const s = await newSession(h);
      await advance(h, s, "start");
      expect(h.scheduler.last("close")?.delayMs).toBe(20_000 + LIMITS.liveQuiz.answerGraceMs);
    }
  });

  it("sai version → RES_003 (409), không mở câu; sai trạng thái → QUIZ_007", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    const stale = await errorOf(h.service.advance(s.host, s.id, "start", 99));
    expect([stale.errorCode, stale.statusCode]).toEqual([ErrorCode.RES_003, 409]);
    expect(h.emitter.of("question")).toHaveLength(0);
    const early = await errorOf(h.service.advance(s.host, s.id, "next", 1)); // còn ở sảnh: chưa có câu để sang
    expect(early.errorCode).toBe(ErrorCode.QUIZ_007);
    await advance(h, s, "start");
    const again = await errorOf(advance(h, s, "start"));
    expect(again.errorCode).toBe(ErrorCode.QUIZ_007);
  });

  it("LQ-05: hai lệnh next cùng lúc cùng version → đúng MỘT lần chuyển câu", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await advance(h, s, "start");
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 }); // công bố → REVEAL
    const { version } = await s.snap();
    const results = await Promise.allSettled([h.service.advance(s.host, s.id, "next", version), h.service.advance(s.host, s.id, "next", version)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as { errorCode: string }).errorCode).toBe(ErrorCode.RES_003);
    expect(h.emitter.of("question").map((e) => e.payload.index)).toEqual([0, 1]);
  });

  it("host bấm next khi câu ĐANG MỞ = chốt câu sớm: công bố ngay, version giữ nguyên, huỷ lệnh hết giờ", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    const started = await advance(h, s, "start");
    const stale = await errorOf(h.service.advance(s.host, s.id, "next", started.version + 5));
    expect(stale.errorCode).toBe(ErrorCode.RES_003);
    const snap = await h.service.advance(s.host, s.id, "next", started.version);
    expect(snap).toMatchObject({ phase: "REVEAL", currentIndex: 0, version: started.version });
    expect(snap.reveal).toMatchObject({ index: 0, correct: 0 });
    expect(h.emitter.of("reveal")).toHaveLength(1);
    expect(h.scheduler.cancelled).toContainEqual({ type: "close", sessionId: s.id, index: 0 });
    // lệnh hết giờ đến sau đó là no-op
    h.emitter.clear();
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 });
    expect(h.emitter.of("reveal")).toHaveLength(0);
  });

  it("đi hết mọi câu: next sau câu cuối → FINISHED (COMPLETED), ghi outbox persist đúng 1 lần, quiz:ended có top", async () => {
    const h = makeHarness();
    const s = await newSession(h, { questions: 2 });
    await advance(h, s, "start");
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 });
    await advance(h, s);
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 1 });
    const done = await advance(h, s);
    expect(done).toMatchObject({ status: "FINISHED", phase: "ENDED" });
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "FINISHED", endReason: "COMPLETED", playersCount: 2 });
    expect(h.outbox.events.filter((e) => e.jobName === "live-quiz.persist")).toHaveLength(1);
    const [ended] = h.emitter.of("ended");
    expect(ended.payload).toMatchObject({ sessionId: s.id, status: "FINISHED", reason: "COMPLETED", endReason: "COMPLETED", resultsReady: false, playersCount: 2 });
    expect(await h.store.resolvePin(s.pin)).toBeNull();
  });
});

describe("quyền", () => {
  it("người chơi gọi lệnh của host → 403; người ngoài → 404; chưa có phiên → 404", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    for (const call of [
      () => h.service.advance(s.player(0), s.id, "start", 1),
      () => h.service.end(s.player(0), s.id, 1, false),
      () => h.service.kick(s.player(0), s.id, HOST),
    ]) {
      const err = await errorOf(call());
      expect([err.statusCode, err.errorCode]).toEqual([403, ErrorCode.AUTH_005]);
    }
    const outsider = userOf(oid(999));
    for (const call of [() => h.service.advance(outsider, s.id, "start", 1), () => h.service.end(outsider, s.id, 1, false), () => h.service.kick(outsider, s.id, oid(100))]) {
      expect((await errorOf(call())).errorCode).toBe(ErrorCode.QUIZ_001);
    }
    expect((await errorOf(h.service.advance(s.host, oid(4242), "start", 1))).errorCode).toBe(ErrorCode.QUIZ_001);
  });
});
