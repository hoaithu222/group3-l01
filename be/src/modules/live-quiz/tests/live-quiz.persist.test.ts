import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { quizScoredSchema } from "../../../shared/events/domain-events";
import { at, advance, errorOf, makeHarness, newSession, type Harness, type Session } from "./support/quiz-harness";
import { oid, userOf } from "./support/quiz-fakes";

/**
 * Ghi kết quả bền (be.md §5 persist-results) + XP: idempotent nhờ CAS `resultsPersistedAt`, LQ-07 (crash giữa persist → chạy lại đủ, không trùng),
 * `quiz.scored` đúng 1 lần/người, Redis mất → không đánh dấu persisted. Kèm `results`/`history` (quyền xem).
 */
async function finishedSession(h: Harness): Promise<Session> {
  const s = await newSession(h, { playerCount: 3, questions: 2, correct: [1, 2] });
  await advance(h, s, "start");
  await at(h, s, 100);
  await h.service.answer(s.player(0), s.id, 0, 1); // đúng
  await at(h, s, 2_000);
  await h.service.answer(s.player(1), s.id, 0, 0); // sai
  await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 });
  await advance(h, s);
  await at(h, s, 500);
  await h.service.answer(s.player(0), s.id, 1, 2); // đúng
  await h.service.answer(s.player(1), s.id, 1, 2); // đúng
  await h.service.end(s.host, s.id, (await s.snap()).version, false);
  return s;
}

describe("persistResults", () => {
  it("ghi một hàng/người (kể cả người chưa trả lời) đúng hạng, đúng số câu, đáp án từng câu; đánh dấu persisted; hạ TTL Redis", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    expect(await h.service.persistResults(s.id)).toBe(3);
    const rows = await h.repo.listResults(s.id);
    const [a, b, c] = s.playerIds;
    expect(rows.map((r) => [r.userId, r.rank, r.correct, r.answered])).toEqual([
      [a, 1, 2, 2],
      [b, 2, 1, 2],
      [c, 3, 0, 0],
    ]);
    expect(rows[0].answers).toEqual([
      expect.objectContaining({ index: 0, choice: 1, correct: true, ms: 100, points: 1000 + 497 }),
      expect.objectContaining({ index: 1, choice: 2, correct: true, ms: 500, points: 1000 + 487 }),
    ]);
    expect(rows[1].answers[0]).toMatchObject({ choice: 0, correct: false, points: 0 });
    expect(rows[2].answers.every((r) => r.choice === null && r.ms === null && r.points === 0)).toBe(true);
    expect(rows[0].score).toBe(rows[0].answers.reduce((n, r) => n + r.points, 0));
    expect((await h.repo.findById(s.id))?.resultsPersistedAt).toBeInstanceOf(Date);
    h.clock.advance((LIMITS.liveQuiz.keepAfterPersistSeconds + 1) * 1000);
    expect(await h.store.getMeta(s.id)).toBeNull(); // khoá nóng chỉ còn `keepAfterPersistSeconds`
  });

  it("phát quiz.scored (LIVE) cho người đã trả lời ≥ 1 câu; dedupeKey theo (session, user); payload hợp lệ với schema gamification", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    await h.service.persistResults(s.id);
    const xp = h.outbox.events.filter((e) => e.jobName === "xp.consume");
    const [a, b, c] = s.playerIds;
    expect(xp.map((e) => e.dedupeKey).sort()).toEqual([a, b].map((u) => `quiz.scored:live:${s.id}:${u}`).sort());
    expect(xp.some((e) => e.dedupeKey?.endsWith(c))).toBe(false);
    for (const e of xp) expect(() => quizScoredSchema.parse(e.payload)).not.toThrow();
    const forA = xp.find((e) => e.dedupeKey?.endsWith(a));
    expect(forA?.payload).toMatchObject({ attemptId: s.id, kind: "LIVE", scorePct: 100, passed: true });
    expect(xp.find((e) => e.dedupeKey?.endsWith(b))?.payload).toMatchObject({ scorePct: 50, passed: true });
  });

  it("idempotent: chạy lại (job retry) → 0 hàng mới, không thêm outbox; hai worker chạy song song → chỉ một bên ghi", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    const [x, y] = await Promise.all([h.service.persistResults(s.id), h.service.persistResults(s.id)]);
    expect([x, y].sort()).toEqual([0, 3]);
    const eventsAfterFirst = h.outbox.events.length;
    expect(await h.service.persistResults(s.id)).toBe(0);
    expect((await h.repo.listResults(s.id)).length).toBe(3);
    expect(h.outbox.events.length).toBe(eventsAfterFirst);
  });

  it("LQ-07: worker chết giữa persist (trước commit) → hoàn tác toàn bộ; chạy lại ghi đủ, QUIZ_SCORED đúng 1 lần/người", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    h.tx.failAfterRun = 1;
    await expect(h.service.persistResults(s.id)).rejects.toThrow("crash");
    expect(await h.repo.listResults(s.id)).toHaveLength(0);
    expect((await h.repo.findById(s.id))?.resultsPersistedAt).toBeNull();
    expect(h.outbox.events.filter((e) => e.jobName === "xp.consume")).toHaveLength(0);

    expect(await h.service.persistResults(s.id)).toBe(3);
    expect(await h.service.persistResults(s.id)).toBe(0);
    const xp = h.outbox.events.filter((e) => e.jobName === "xp.consume");
    expect(xp).toHaveLength(2);
    expect(new Set(xp.map((e) => e.dedupeKey)).size).toBe(2);
  });

  it("khoá Redis đã hết hạn → trả -1 và KHÔNG đánh dấu persisted (không ghi bảng rỗng)", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    h.store.drop(s.id);
    expect(await h.service.persistResults(s.id)).toBe(-1);
    expect((await h.repo.findById(s.id))?.resultsPersistedAt).toBeNull();
    expect(await h.repo.listResults(s.id)).toHaveLength(0);
  });

  it("phiên bị huỷ (CANCELLED) không có outbox persist và có gọi persist thủ công cũng không ghi gì", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 2 });
    await h.service.end(s.host, s.id, 1, true);
    expect(h.outbox.events).toHaveLength(0);
    expect(await h.service.persistResults(s.id)).toBe(0);
    expect(await h.repo.listResults(s.id)).toHaveLength(0);
  });

  it("finish idempotent + tự chữa: Redis đã FINISHED mà Mongo còn mở (lần trước chết giữa chừng) → lần gọi sau đóng Mongo + ghi outbox persist", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 1 });
    await advance(h, s, "start");
    await h.store.finish(s.id, null, "FINISHED", "*"); // chỉ Redis đổi, Mongo còn IN_PROGRESS
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
    const res = await h.service.end(s.host, s.id, 99, true); // xin CANCELLED nhưng Redis đã FINISHED → giữ FINISHED
    expect(res).toEqual({ status: "FINISHED" });
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "FINISHED", endReason: "HOST_ENDED" });
    expect(h.outbox.events.filter((e) => e.jobName === "live-quiz.persist")).toHaveLength(1);
    expect(h.emitter.of("ended")).toHaveLength(1);
    await h.service.end(s.host, s.id, 99, false); // gọi lại: không thêm outbox, không phát lại
    expect(h.outbox.events.filter((e) => e.jobName === "live-quiz.persist")).toHaveLength(1);
    expect(h.emitter.of("ended")).toHaveLength(1);
  });
});

describe("results / history", () => {
  it("results: host và người có kết quả xem được; kèm setId/setTitle/total; persisted=false trước khi ghi", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    const before = await h.service.results(s.host, s.id);
    expect(before).toMatchObject({ sessionId: s.id, setTitle: "Bộ thử", total: 2, status: "FINISHED", persisted: false, results: [] });
    expect(before.setId).toMatch(/^[0-9a-f]{24}$/);
    await h.service.persistResults(s.id);
    const mine = await h.service.results(s.player(1), s.id);
    expect(mine).toMatchObject({ persisted: true, setTitle: "Bộ thử", total: 2 });
    expect(mine.results).toHaveLength(3);
    expect(mine.results[0]).toHaveProperty("answers");
  });

  it("results: người CHƠI khi chưa ghi xong nhận persisted=false (để thăm dò), không phải 404; người ngoài/phiên lạ/đã bị mời ra → 404 QUIZ_001", async () => {
    const h = makeHarness();
    const s = await finishedSession(h);
    const early = await h.service.results(s.player(0), s.id); // chưa persist → chưa có hàng của mình, nhưng còn trong phòng ở Redis
    expect(early).toMatchObject({ persisted: false, results: [], status: "FINISHED" });
    expect((await errorOf(h.service.results(userOf(oid(999)), s.id))).errorCode).toBe(ErrorCode.QUIZ_001);
    await h.service.persistResults(s.id);
    expect((await h.service.results(s.player(0), s.id)).persisted).toBe(true);
    expect((await errorOf(h.service.results(userOf(oid(999)), s.id))).errorCode).toBe(ErrorCode.QUIZ_001);
    expect((await errorOf(h.service.results(s.host, oid(4242)))).errorCode).toBe(ErrorCode.QUIZ_001);
    const kicked = await newSession(h, { playerCount: 1 });
    await h.service.kick(kicked.host, kicked.id, kicked.playerIds[0]);
    await h.service.end(kicked.host, kicked.id, 1, true);
    expect((await errorOf(h.service.results(kicked.player(0), kicked.id))).errorCode).toBe(ErrorCode.QUIZ_001);
  });

  it("history: mới → cũ, phân trang cursor không sót/không trùng, mang setId/setTitle/total", async () => {
    const h = makeHarness();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const s = await finishedSession(h);
      await h.service.persistResults(s.id);
      ids.push(s.id);
      h.clock.advance(1000);
    }
    // cùng người chơi ở cả 3 phiên (player 0 luôn là oid(100))
    const me = userOf(oid(100));
    const p1 = await h.service.history(me, { limit: 2 });
    expect(p1.data).toHaveLength(2);
    expect(p1.meta).toMatchObject({ hasMore: true, limit: 2 });
    const p2 = await h.service.history(me, { limit: 2, cursor: p1.meta.nextCursor ?? undefined });
    const seen = [...p1.data, ...p2.data].map((r) => (r as { sessionId: string }).sessionId);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(seen).toEqual([...ids].reverse());
    expect(p2.meta.hasMore).toBe(false);
    expect(p1.data[0]).toMatchObject({ setTitle: "Bộ thử", total: 2, rank: 1 });
  });
});
