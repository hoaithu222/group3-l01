import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { at, advance, errorOf, makeHarness, newSession, type Harness, type Session } from "./support/quiz-harness";
import { oid, userOf } from "./support/quiz-fakes";

/**
 * Nộp đáp án + tính điểm/xếp hạng (be.md §5 answer.lua, README §8): LQ-01 (trùng), LQ-02 (quá hạn), hạng theo ms server,
 * tie-break, đóng câu sớm khi mọi người đã trả lời, `quiz:progress` chỉ tới host, không lộ đúng/sai trước reveal.
 */
async function started(h: Harness, o: Parameters<typeof newSession>[1] = {}): Promise<Session> {
  const s = await newSession(h, o);
  await advance(h, s, "start");
  return s;
}
const reveal = (h: Harness, s: Session, index = 0) => h.service.runCommand({ type: "close", sessionId: s.id, index });

describe("nộp đáp án", () => {
  it("chỉ trả {accepted, answered, players} — KHÔNG có đúng/sai hay điểm trước reveal", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3 });
    const res = await h.service.answer(s.player(0), s.id, 0, 0);
    expect(res).toEqual({ accepted: true, answered: 1, players: 3 });
    expect(h.emitter.of("reveal")).toHaveLength(0);
    expect((await s.snap()).reveal).toBeUndefined();
  });

  it("LQ-01: nộp lần 2 cùng câu → QUIZ_004 (409), điểm không đổi (lần đầu được giữ)", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 2 });
    await at(h, s, 300);
    await h.service.answer(s.player(0), s.id, 0, 0);
    await at(h, s, 400);
    const err = await errorOf(h.service.answer(s.player(0), s.id, 0, 1));
    expect([err.errorCode, err.statusCode]).toEqual([ErrorCode.QUIZ_004, 409]);
    await reveal(h, s);
    const top = h.emitter.of("leaderboard")[0].payload.top;
    expect(top.find((r) => r.userId === s.playerIds[0])).toMatchObject({ score: 1000 + Math.floor((500 * (20_000 - 300)) / 20_000), cumulativeMs: 300 });
    expect(h.emitter.of("reveal")[0].payload.stats).toEqual({ "0": 1 });
  });

  it("LQ-02: nộp sau deadlineAt → QUIZ_005, 0 điểm; đúng hạn chót (= deadlineAt) vẫn nhận", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3, seconds: 20 });
    await at(h, s, 20_000);
    await expect(h.service.answer(s.player(0), s.id, 0, 0)).resolves.toMatchObject({ accepted: true });
    await at(h, s, 20_001);
    const late = await errorOf(h.service.answer(s.player(1), s.id, 0, 0));
    expect([late.errorCode, late.statusCode]).toEqual([ErrorCode.QUIZ_005, 409]);
    await reveal(h, s);
    const top = h.emitter.of("leaderboard")[0].payload.top;
    expect(top.find((r) => r.userId === s.playerIds[1])?.score).toBe(0);
    expect(top.find((r) => r.userId === s.playerIds[0])?.score).toBe(1000); // elapsed = span → chỉ base
  });

  it("LQ-01 sau khi câu đã đóng: người ĐÃ trả lời gửi lại (ack thất lạc → thử lại) nhận QUIZ_004, người CHƯA trả lời nhận QUIZ_005", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3 });
    await h.service.answer(s.player(0), s.id, 0, 0);
    await h.service.answer(s.player(1), s.id, 0, 1);
    await h.service.advance(s.host, s.id, "next", (await s.snap()).version); // host chốt câu sớm khi mới 2/3 trả lời
    expect(h.emitter.of("reveal")).toHaveLength(1);
    const resent = await errorOf(h.service.answer(s.player(0), s.id, 0, 1));
    expect([resent.errorCode, resent.statusCode]).toEqual([ErrorCode.QUIZ_004, 409]);
    expect((await errorOf(h.service.answer(s.player(2), s.id, 0, 0))).errorCode).toBe(ErrorCode.QUIZ_005);
  });

  it("LQ-01 một người chơi: trả lời xong câu đóng ngay (đủ người) nhưng gửi lại vẫn QUIZ_004, điểm không đổi", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 1 });
    await h.service.answer(s.player(0), s.id, 0, 0);
    expect(h.emitter.of("reveal")).toHaveLength(1);
    expect((await errorOf(h.service.answer(s.player(0), s.id, 0, 3))).errorCode).toBe(ErrorCode.QUIZ_004);
    expect((await h.store.scores(s.id))[0].score).toBe(1500);
  });

  it("câu đã đóng / sai chỉ số câu / phiên chưa chạy → QUIZ_005; lựa chọn ngoài phạm vi → QUIZ_007", async () => {
    const h = makeHarness();
    const s = await newSession(h, { playerCount: 2 });
    expect((await errorOf(h.service.answer(s.player(0), s.id, 0, 0))).errorCode).toBe(ErrorCode.QUIZ_005); // còn ở sảnh
    await advance(h, s, "start");
    expect((await errorOf(h.service.answer(s.player(0), s.id, 1, 0))).errorCode).toBe(ErrorCode.QUIZ_005); // câu 1 chưa mở
    expect((await errorOf(h.service.answer(s.player(0), s.id, 0, 4))).errorCode).toBe(ErrorCode.QUIZ_007); // chỉ có 4 lựa chọn
    await reveal(h, s);
    expect((await errorOf(h.service.answer(s.player(0), s.id, 0, 0))).errorCode).toBe(ErrorCode.QUIZ_005); // đã công bố
  });

  it("người ngoài phòng / người đã bị mời ra không nộp được (QUIZ_001)", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 2 });
    expect((await errorOf(h.service.answer(userOf(oid(999)), s.id, 0, 0))).errorCode).toBe(ErrorCode.QUIZ_001);
    await h.service.kick(s.host, s.id, s.playerIds[0]);
    expect((await errorOf(h.service.answer(s.player(0), s.id, 0, 0))).errorCode).toBe(ErrorCode.QUIZ_001);
  });
});

describe("công bố + bảng xếp hạng", () => {
  it("hạng theo điểm rồi tổng ms; reveal có đáp án + thống kê + giải thích; mỗi người nhận me đầy đủ (userId, rank, score, cumulativeMs)", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3, correct: [2] });
    const [a, b, c] = s.playerIds;
    await at(h, s, 200);
    await h.service.answer(s.player(0), s.id, 0, 2);
    await at(h, s, 5_000);
    await h.service.answer(s.player(1), s.id, 0, 2);
    await at(h, s, 6_000);
    await h.service.answer(s.player(2), s.id, 0, 1);
    await h.emitter.flush();
    expect(h.emitter.of("reveal")).toHaveLength(1); // cả 3 đã trả lời ⇒ đóng sớm, không cần lệnh hết giờ

    const [rv] = h.emitter.of("reveal");
    expect(rv.payload).toMatchObject({ index: 0, correct: 2, stats: { "2": 2, "1": 1 }, explanation: "Giải thích câu 0", serverNow: h.clock.t });
    const [lb] = h.emitter.of("leaderboard");
    expect(lb.payload.top.map((r) => [r.userId, r.rank, r.score])).toEqual([
      [a, 1, 1000 + 495],
      [b, 2, 1000 + 375],
      [c, 3, 0],
    ]);
    expect(lb.payload).toMatchObject({ playersCount: 3, index: 0, serverNow: h.clock.t });
    const mine = Object.fromEntries(h.emitter.of("me").map((e) => [e.to, e.payload.me]));
    expect(mine[`user:${b}`]).toEqual({ userId: b, rank: 2, score: 1375, cumulativeMs: 5_000 });
    expect(h.emitter.of("me")).toHaveLength(3);
    expect(h.emitter.of("me")[0].payload).not.toHaveProperty("top"); // top chung đã ở quiz:leaderboard
  });

  it("cùng điểm: ai đúng nhanh hơn (tổng ms nhỏ hơn) xếp trên, qua nhiều câu cộng dồn", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 2, questions: 2 });
    await at(h, s, 1);
    await h.service.answer(s.player(1), s.id, 0, 0); // 1499 điểm, 1 ms
    await at(h, s, 2);
    await h.service.answer(s.player(0), s.id, 0, 0); // 1499 điểm, 2 ms
    await advance(h, s);
    await at(h, s, 0);
    await h.service.answer(s.player(0), s.id, 1, 0);
    await h.service.answer(s.player(1), s.id, 1, 0);
    const top = h.emitter.of("leaderboard").at(-1)?.payload.top ?? [];
    expect(top.map((r) => r.userId)).toEqual([s.playerIds[1], s.playerIds[0]]);
    expect(top[0]).toMatchObject({ score: 1499 + 1500, cumulativeMs: 1 });
    expect(top[1]).toMatchObject({ score: 1499 + 1500, cumulativeMs: 2 });
  });

  it("snapshot ở pha REVEAL có reveal (đáp án đúng) cho mọi người; đang mở câu thì không", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 1, correct: [3] });
    expect(await h.service.get(s.player(0), s.id)).not.toHaveProperty("reveal");
    await reveal(h, s);
    expect((await h.service.get(s.player(0), s.id)).reveal).toMatchObject({ index: 0, correct: 3 });
  });
});

describe("đóng câu sớm + quiz:progress", () => {
  it("chưa đủ người → không công bố; báo host số đã trả lời (chỉ tới user:{hostId}); snapshot host có answeredCount", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3 });
    await h.service.answer(s.player(0), s.id, 0, 1);
    await h.service.answer(s.player(1), s.id, 0, 2);
    await h.emitter.flush();
    expect(h.emitter.of("reveal")).toHaveLength(0);
    const progress = h.emitter.of("progress");
    expect(progress.map((e) => [e.to, e.payload.answeredCount, e.payload.playersCount])).toEqual([
      [`user:${s.host.id}`, 1, 3],
      [`user:${s.host.id}`, 2, 3],
    ]);
    expect((await s.snap()).answeredCount).toBe(2);
    expect(await h.service.get(s.player(0), s.id)).not.toHaveProperty("answeredCount");
  });

  it("người bị mời ra không còn được chờ: những người còn lại trả lời xong → công bố", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 3 });
    await h.service.answer(s.player(0), s.id, 0, 0);
    await h.service.kick(s.host, s.id, s.playerIds[2]);
    expect(h.emitter.of("reveal")).toHaveLength(0);
    await h.service.answer(s.player(1), s.id, 0, 0);
    expect(h.emitter.of("reveal")).toHaveLength(1);
  });

  it("autoAdvance: công bố xong hẹn lệnh `advance` sau revealSeconds; lệnh chạy → sang câu kế; host đã next trước → bỏ qua", async () => {
    const h = makeHarness();
    const s = await started(h, { playerCount: 1, autoAdvance: true });
    await h.service.answer(s.player(0), s.id, 0, 0);
    expect(h.scheduler.last("advance")).toMatchObject({ cmd: { type: "advance", sessionId: s.id, index: 0 }, delayMs: LIMITS.liveQuiz.revealSeconds * 1000 });
    await h.service.runCommand({ type: "advance", sessionId: s.id, index: 0 });
    expect((await s.snap()).currentIndex).toBe(1);
    await h.service.runCommand({ type: "advance", sessionId: s.id, index: 0 }); // trùng: currentIndex đã lệch → bỏ qua
    expect((await s.snap()).currentIndex).toBe(1);
    expect(h.emitter.of("question").map((e) => e.payload.index)).toEqual([0, 1]);
  });
});
