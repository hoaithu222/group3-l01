import type { MockQuestion } from "../entities/mock.interface";
import { scoreAttempt } from "../services/mock-scoring";
import { AUTHOR } from "./support/harness";
import { fill, makeLearningHarness, seedQuizSet, type LearningHarness } from "./support/learning-harness";

const DTO = { count: 50, durationSec: 600, shuffle: false, passPct: 50 };
const VN_TOMORROW_MIDNIGHT = new Date("2026-09-21T17:00:00.000Z"); // 00:00 ngày 22/09 giờ VN (harness: 10:00 ngày 21/09)

const snapshot = (h: LearningHarness, attemptId: string): MockQuestion[] => (h.attempts.rows.get(attemptId) as { questions: MockQuestion[] }).questions;
const right = (q: MockQuestion) => ({ itemId: q.itemId, optionIds: q.correctOptionIds, timeMs: 0 });
const wrong = (q: MockQuestion) => ({ itemId: q.itemId, optionIds: [q.options.find((o) => !q.correctOptionIds.includes(o.id))!.id], timeMs: 0 });

describe("MockGradingService — chấm, byTag, SR câu sai, outbox (p4-02)", () => {
  it("ST-06: nộp bài có 4 câu sai (chưa từng ôn) → 4 SrProgress interval 1, nextReviewAt = 00:00 ngày mai tz tài khoản; đúng 1 outbox quiz.scored", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 6);
    const a = await h.mock.create(AUTHOR, setId, DTO);
    const q = snapshot(h, a.attempt.id);
    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [right(q[0]), right(q[1]), wrong(q[2]), wrong(q[3]), wrong(q[4]), wrong(q[5])] });

    const result = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(result.attempt).toMatchObject({ status: "SUBMITTED", correctCount: 2, scorePct: 33.3, passed: false, answeredCount: 6 });

    const rows = [...h.progress.rows.values()];
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.itemId))).toEqual(new Set(q.slice(2).map((x) => x.itemId)));
    for (const r of rows) {
      expect(r).toMatchObject({ userId: AUTHOR.id, source: "MOCK_WRONG", status: "LEARNING", interval: 1, repetition: 0, lapses: 0 });
      expect(r.nextReviewAt).toEqual(VN_TOMORROW_MIDNIGHT);
    }

    const scored = h.outbox.ofType("quiz.scored");
    expect(scored).toHaveLength(1);
    expect(scored[0]).toMatchObject({
      queue: "gamification",
      jobName: "xp.consume",
      dedupeKey: `quiz.scored:attempt:${a.attempt.id}`,
      payload: { attemptId: a.attempt.id, userId: AUTHOR.id, setId, kind: "MOCK", passed: false, scorePct: 33.3 },
    });
  });

  it("chấm ghi correct/partial cho từng đáp án; câu chưa trả lời = sai (vẫn vào SR); kết quả có đáp án + giải thích + correct từng câu", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 3);
    const a = await h.mock.create(AUTHOR, setId, DTO);
    const q = snapshot(h, a.attempt.id);
    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [right(q[0]), wrong(q[1])] }); // câu 3 bỏ trống

    const result = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(result.questions.map((x) => x.correct)).toEqual([true, false, false]);
    expect(result.questions[2].myAnswer).toBeNull();
    expect(result.questions[0].correctOptionIds).toEqual(q[0].correctOptionIds);
    expect([...h.answers.rows.values()].map((r) => r.correct).sort()).toEqual([false, true]);
    expect(h.progress.rows.size).toBe(2);
  });

  it("byTag: mỗi câu vào mọi thẻ của nó, câu không thẻ → __untagged; vượt byTagMax gộp phần còn lại vào __other", () => {
    const question = (i: number, tags: string[]): MockQuestion => ({
      itemId: String(i).padStart(24, "0"),
      type: "MULTIPLE_CHOICE",
      prompt: `Q${i}`,
      options: [{ id: "o_aaaaaa", text: "A", mediaAssetId: null }, { id: "o_bbbbbb", text: "B", mediaAssetId: null }],
      correctOptionIds: ["o_aaaaaa"],
      acceptedAnswers: [],
      matchMode: "IGNORE_CASE",
      explanation: null,
      frontMediaAssetId: null,
      tags,
    });
    const few = [question(1, ["a", "b"]), question(2, ["a"]), question(3, [])];
    const okA = { itemId: few[0].itemId, optionIds: ["o_aaaaaa"], text: null };
    const s1 = scoreAttempt(few, [okA], 50);
    expect(s1.byTag).toEqual([
      { tag: "a", correct: 1, total: 2 },
      { tag: "__untagged", correct: 0, total: 1 },
      { tag: "b", correct: 1, total: 1 },
    ]);

    const many = Array.from({ length: 10 }, (_, i) => question(i + 10, [`tag${i}`]));
    const s2 = scoreAttempt(many, many.slice(0, 9).map((m) => ({ itemId: m.itemId, optionIds: ["o_aaaaaa"], text: null })), 50);
    expect(s2.byTag).toHaveLength(9);
    expect(s2.byTag[8]).toEqual({ tag: "__other", correct: 1, total: 2 }); // tag8 đúng, tag9 chưa trả lời
    expect(s2).toMatchObject({ correctCount: 9, scorePct: 90, passed: true });
  });

  it("MULTI_SELECT/FILL_BLANK chấm bằng gradeAnswer dùng chung (điền chỗ trống bỏ hoa thường; multi-select sai một lựa chọn = sai)", async () => {
    const h = makeLearningHarness();
    const multi = { type: "MULTI_SELECT", clientItemKey: "ms", prompt: "Chọn số chẵn", options: [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }], correctOptionIndexes: [1, 3] };
    const { setId } = await seedQuizSet(h, 0, 0, [multi, fill("fb")]);
    const a = await h.mock.create(AUTHOR, setId, DTO);
    const [ms, fb] = snapshot(h, a.attempt.id);
    await h.mock.putAnswers(AUTHOR, a.attempt.id, {
      answers: [{ itemId: ms.itemId, optionIds: [ms.correctOptionIds[0]], timeMs: 0 }, { itemId: fb.itemId, text: "  HÀ   NỘI ", timeMs: 0 }],
    });
    const result = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(result.questions.map((x) => x.correct)).toEqual([false, true]);
    expect(result.questions[0].partial).toBeGreaterThan(0);
  });

  it("thẻ đã có tiến độ: câu sai áp lapse (q = 2) thay vì tạo mới; thẻ SUSPENDED không bị đụng", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 3);
    await h.sr.enroll(AUTHOR, { setId });
    const [i1, i2, i3] = items;
    // i2 đã học lâu, i3 đang tạm ngừng.
    const p2 = [...h.progress.rows.values()].find((r) => r.itemId === i2.id)!;
    Object.assign(p2, { status: "REVIEW", interval: 10, repetition: 3, easiness: 2.5, lastRating: "GOOD", lastReviewedAt: h.now() });
    const p3 = [...h.progress.rows.values()].find((r) => r.itemId === i3.id)!;
    Object.assign(p3, { status: "SUSPENDED", suspendedReason: "LOST_ACCESS" });

    const a = await h.mock.create(AUTHOR, setId, DTO);
    await h.mock.submit(AUTHOR, a.attempt.id, {}); // bỏ trống cả 3 câu → 3 câu sai

    const byItem = (id: string) => [...h.progress.rows.values()].find((r) => r.itemId === id)!;
    expect(byItem(i1.id)).toMatchObject({ source: "ENROLL", status: "LEARNING", interval: 1, repetition: 0, lapses: 1, easiness: 2.18 });
    expect(byItem(i2.id)).toMatchObject({ status: "LEARNING", interval: 1, lapses: 1, easiness: 2.18, lastRating: "GOOD" });
    expect(byItem(i2.id).nextReviewAt).toEqual(VN_TOMORROW_MIDNIGHT);
    expect(byItem(i3.id)).toMatchObject({ status: "SUSPENDED", lapses: 0 });
    expect(h.progress.rows.size).toBe(3);
  });

  it("mục đã bị xoá khỏi bộ trước khi nộp → không tạo tiến độ; người thi mất quyền đọc bộ → không tạo tiến độ", async () => {
    const h = makeLearningHarness();
    const { setId, version, items } = await seedQuizSet(h, 2);
    const a = await h.mock.create(AUTHOR, setId, DTO);
    await h.bulk.save(AUTHOR, setId, { expectedVersion: version, upsert: [], delete: [items[0].id] } as never);
    await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect([...h.progress.rows.values()].map((r) => r.itemId)).toEqual([items[1].id]);

    const other = await seedQuizSet(h, 1);
    const b = await h.mock.create(AUTHOR, other.setId, DTO);
    await h.setService.remove(AUTHOR, other.setId);
    await h.mock.submit(AUTHOR, b.attempt.id, {});
    expect(h.progress.rows.size).toBe(1);
  });

  it("finalize lần hai (CAS thất bại) không đổi gì: không ghi thêm outbox/thông báo, trả alreadyFinal", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 1);
    const a = await h.mock.create(AUTHOR, setId, DTO);
    const first = await h.mock.grading.finalize(a.attempt.id, "AUTO");
    const second = await h.mock.grading.finalize(a.attempt.id, "AUTO");
    expect([first.alreadyFinal, second.alreadyFinal]).toEqual([false, true]);
    expect(second.attempt.version).toBe(first.attempt.version);
    expect(h.outbox.ofType("quiz.scored")).toHaveLength(1);
    expect(h.notifier.sent).toHaveLength(1);
  });

  it("MANUAL không gửi thông báo tự nộp; AUTO có; ngưỡng đạt theo passPct của lượt", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await h.mock.create(AUTHOR, setId, { ...DTO, passPct: 60 });
    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [right(snapshot(h, a.attempt.id)[0])] });
    const done = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(done.attempt).toMatchObject({ scorePct: 50, passed: false, passPct: 60 });
    expect(h.notifier.sent).toHaveLength(0);
  });
});
