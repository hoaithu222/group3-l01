import { LIMITS } from "../../../core/constants/limits";
import type { MockQuestion } from "../entities/mock.interface";
import type { MockInProgressDto, MockResultDto } from "../services/mock-attempt.presenter";
import { AUTHOR, MEMBER, STRANGER, mc } from "./support/harness";
import { fill, makeLearningHarness, seedQuizSet, type LearningHarness } from "./support/learning-harness";

const DTO = { count: 10, durationSec: 600, shuffle: false, passPct: 50 };
const GRACE_MS = LIMITS.mock.expireGraceSec * 1000;

const start = (h: LearningHarness, setId: string, over: Partial<typeof DTO> & { tags?: string[] } = {}) => h.mock.create(AUTHOR, setId, { ...DTO, ...over });
const snapshot = (h: LearningHarness, attemptId: string): MockQuestion[] => (h.attempts.rows.get(attemptId) as { questions: MockQuestion[] }).questions;
const right = (q: MockQuestion) => ({ itemId: q.itemId, optionIds: q.correctOptionIds });
const wrong = (q: MockQuestion) => ({ itemId: q.itemId, optionIds: [q.options.find((o) => !q.correctOptionIds.includes(o.id))!.id] });

describe("MockAttemptService — tạo lượt, đề, đáp án, sự kiện (p4-02)", () => {
  it("ST-21: đề trả về KHÔNG có correctOptionIds/acceptedAnswers/explanation (cả lúc tạo lẫn GET khi đang làm)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 3, 0, [fill("fb", { explanation: "Thủ đô" })]);
    const created = await start(h, setId);
    expect(created.questions).toHaveLength(4);

    for (const body of [JSON.stringify(created), JSON.stringify(await h.mock.get(AUTHOR, created.attempt.id))]) {
      expect(body).not.toContain("correctOptionIds");
      expect(body).not.toContain("acceptedAnswers");
      expect(body).not.toContain("explanation");
      expect(body).not.toContain("hà nội");
    }
    expect(created.attempt).toMatchObject({ status: "IN_PROGRESS", total: 4, correctCount: null, scorePct: null, passed: null });
    expect(new Date(created.expiresAt).getTime() - new Date(created.attempt.startedAt).getTime()).toBe(600_000);
  });

  it("MOCK_001: bộ chỉ có thẻ ghi nhớ; count > số câu → cắt về số câu có; lọc thẻ không khớp → MOCK_001", async () => {
    const h = makeLearningHarness();
    const flashOnly = await seedQuizSet(h, 0, 3);
    await expect(start(h, flashOnly.setId)).rejects.toMatchObject({ errorCode: "MOCK_001", statusCode: 409 });

    const quiz = await seedQuizSet(h, 2);
    const ok = await start(h, quiz.setId, { count: 200 });
    expect(ok.questions).toHaveLength(2);

    await h.mock.grading.finalize(ok.attempt.id, "MANUAL");
    await expect(start(h, quiz.setId, { tags: ["khong-co"] })).rejects.toMatchObject({ errorCode: "MOCK_001" });
  });

  it("ST-23: tạo lượt mới khi còn lượt dở cùng bộ → 409 MOCK_002 { attemptId }", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const first = await start(h, setId);
    await expect(start(h, setId)).rejects.toMatchObject({ errorCode: "MOCK_002", statusCode: 409, details: { attemptId: first.attempt.id } });
  });

  it("lượt dở đã quá hạn mà job chưa chạy → nộp hộ (AUTO) rồi cho tạo lượt mới, không kẹt MOCK_002", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const first = await start(h, setId, { durationSec: 60 });
    h.clock.now = new Date(h.clock.now.getTime() + 60_000 + GRACE_MS + 1);
    const second = await start(h, setId);
    expect(second.attempt.id).not.toBe(first.attempt.id);
    expect(h.attempts.rows.get(first.attempt.id)).toMatchObject({ status: "EXPIRED", submitMode: "AUTO" });
  });

  it("MOCK_006: quá attemptsPerSetPerDayMax lượt/bộ/ngày (theo ngày địa phương)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 1);
    for (let i = 0; i < LIMITS.mock.attemptsPerSetPerDayMax; i += 1) {
      const a = await start(h, setId);
      await h.mock.submit(AUTHOR, a.attempt.id, {});
    }
    await expect(start(h, setId)).rejects.toMatchObject({ errorCode: "MOCK_006", statusCode: 429 });
    // Sang ngày địa phương kế tiếp → được thi lại.
    h.clock.now = new Date(h.clock.now.getTime() + 24 * 3_600_000);
    await expect(start(h, setId)).resolves.toBeDefined();
  });

  it("bộ ẩn/xoá hoặc người ngoài → 404 trung tính (không lộ bộ tồn tại)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    await expect(h.mock.create(STRANGER, setId, { ...DTO })).rejects.toMatchObject({ statusCode: 404 });
    await h.setService.remove(AUTHOR, setId);
    await expect(start(h, setId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lưu đáp án: idempotent theo câu, bỏ chọn xoá đáp án, answeredCount đúng; chỉ chủ lượt thấy (người khác → 404)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 3);
    const a = await start(h, setId);
    const q = snapshot(h, a.attempt.id);

    expect(await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [{ ...right(q[0]), timeMs: 0 }, { ...wrong(q[1]), timeMs: 0 }] })).toMatchObject({ answeredCount: 2 });
    // Đổi ý câu 0 (ghi đè, không nhân bản) và bỏ chọn câu 1.
    const res = await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [{ ...wrong(q[0]), timeMs: 0 }, { itemId: q[1].itemId, optionIds: [], timeMs: 0 }] });
    expect(res.answeredCount).toBe(1);
    const view = (await h.mock.get(AUTHOR, a.attempt.id)) as MockInProgressDto;
    expect(view.myAnswers).toHaveLength(1);
    expect(view.myAnswers[0].optionIds).toEqual(wrong(q[0]).optionIds);

    await expect(h.mock.get(STRANGER, a.attempt.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.mock.putAnswers(MEMBER, a.attempt.id, { answers: [{ ...right(q[0]), timeMs: 0 }] })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("MOCK_005: câu lạ, lựa chọn không thuộc câu, chọn nhiều cho câu một-đáp-án, điền chỗ trống thiếu text", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 1, 0, [fill("fb")]);
    const a = await start(h, setId);
    const [q1, q2] = snapshot(h, a.attempt.id);
    const put = (answers: object[]) => h.mock.putAnswers(AUTHOR, a.attempt.id, { answers } as never);

    await expect(put([{ itemId: "f".repeat(24), optionIds: ["o_aaaaaa"], timeMs: 0 }])).rejects.toMatchObject({ errorCode: "MOCK_005", statusCode: 400 });
    await expect(put([{ itemId: q1.itemId, optionIds: ["o_zzzzzz"], timeMs: 0 }])).rejects.toMatchObject({ errorCode: "MOCK_005" });
    await expect(put([{ itemId: q1.itemId, optionIds: q1.options.slice(0, 2).map((o) => o.id), timeMs: 0 }])).rejects.toMatchObject({ errorCode: "MOCK_005" });
    await expect(put([{ itemId: q2.itemId, optionIds: ["o_aaaaaa"], timeMs: 0 }])).rejects.toMatchObject({ errorCode: "MOCK_005" });
    await expect(put([{ itemId: q2.itemId, text: "Hà Nội", timeMs: 0 }])).resolves.toMatchObject({ answeredCount: 1 });
  });

  it("ST-22: lưu đáp án sau expiresAt + 5 s → MOCK_003; trong khoảng ân hạn vẫn nhận; sau khi nộp → MOCK_004", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await start(h, setId, { durationSec: 120 });
    const q = snapshot(h, a.attempt.id);
    const body = { answers: [{ ...right(q[0]), timeMs: 0 }] };

    h.clock.now = new Date(new Date(a.expiresAt).getTime() + GRACE_MS); // đúng biên ân hạn
    await expect(h.mock.putAnswers(AUTHOR, a.attempt.id, body)).resolves.toMatchObject({ answeredCount: 1 });
    h.clock.now = new Date(new Date(a.expiresAt).getTime() + GRACE_MS + 1);
    await expect(h.mock.putAnswers(AUTHOR, a.attempt.id, body)).rejects.toMatchObject({ errorCode: "MOCK_003", statusCode: 409 });

    const b = await start(h, setId);
    await h.mock.submit(AUTHOR, b.attempt.id, {});
    await expect(h.mock.putAnswers(AUTHOR, b.attempt.id, { answers: [{ ...right(snapshot(h, b.attempt.id)[0]), timeMs: 0 }] })).rejects.toMatchObject({ errorCode: "MOCK_004" });
  });

  it("ST-22: nộp 2 lần trả CÙNG kết quả (không chấm lại, một quiz.scored); job hết giờ chạy sau khi nộp tay là no-op", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await start(h, setId);
    const q = snapshot(h, a.attempt.id);
    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: [{ ...right(q[0]), timeMs: 0 }] });

    const first = await h.mock.submit(AUTHOR, a.attempt.id, {});
    h.clock.now = new Date(h.clock.now.getTime() + 3_600_000);
    const second = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(second.attempt).toEqual(first.attempt);
    expect(first.attempt).toMatchObject({ status: "SUBMITTED", submitMode: "MANUAL", correctCount: 1, scorePct: 50, passed: true });

    expect(await h.mock.expire(a.attempt.id)).toBe("NOOP");
    expect(h.outbox.ofType("quiz.scored")).toHaveLength(1);
    expect(h.notifier.sent).toHaveLength(0);
  });

  it("nộp tay xoá dòng outbox hết giờ chưa dispatch; tạo lượt ghi dòng outbox với availableAt = hạn + ân hạn", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 1);
    const a = await start(h, setId, { durationSec: 300 });
    const expireRow = h.outbox.events.find((e) => e.jobName === "mock-attempt.expire");
    expect(expireRow).toMatchObject({ queue: "cron", dedupeKey: `mock-attempt.expire:attempt:${a.attempt.id}` });
    expect(expireRow?.availableAt?.getTime()).toBe(new Date(a.expiresAt).getTime() + GRACE_MS);

    await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(h.outbox.events.some((e) => e.jobName === "mock-attempt.expire")).toBe(false);
  });

  it("ST-05 (phần server): 3 câu đã lưu, quá hạn → job tự nộp ĐÚNG 1 lần (EXPIRED/AUTO), điểm tính 3 câu, 1 thông báo; chạy lại không tạo quiz.scored thứ hai", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 5);
    const a = await start(h, setId, { durationSec: 120 });
    const q = snapshot(h, a.attempt.id);
    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: q.slice(0, 3).map((x) => ({ ...right(x), timeMs: 0 })) });

    h.clock.now = new Date(new Date(a.expiresAt).getTime() + GRACE_MS);
    expect(await h.mock.expire(a.attempt.id)).toBe("EXPIRED");
    expect(await h.mock.expire(a.attempt.id)).toBe("NOOP");

    const result = (await h.mock.get(AUTHOR, a.attempt.id)) as MockResultDto;
    expect(result.attempt).toMatchObject({ status: "EXPIRED", submitMode: "AUTO", answeredCount: 3, correctCount: 3, scorePct: 60, passed: true });
    expect(h.notifier.sent).toHaveLength(1);
    expect(h.notifier.sent[0]).toMatchObject({ type: "study.mock-auto-submitted", recipients: [{ userId: AUTHOR.id }], refs: { attemptId: a.attempt.id } });
    expect(h.outbox.ofType("quiz.scored")).toHaveLength(1);
  });

  it("GET khi quá hạn mà job chưa chạy → nộp hộ rồi trả kết quả (mở lại app thấy kết quả)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await start(h, setId, { durationSec: 60 });
    h.clock.now = new Date(new Date(a.expiresAt).getTime() + GRACE_MS + 1);
    const result = (await h.mock.get(AUTHOR, a.attempt.id)) as MockResultDto;
    expect(result.attempt.status).toBe("EXPIRED");
    expect(result.questions[0]).toHaveProperty("correctOptionIds");
    expect(h.notifier.sent).toHaveLength(1);
  });

  it("nộp kèm answers còn trong hạn → lưu rồi chấm; kèm answers quá hạn → bỏ qua (lateAnswersIgnored), vẫn chấm phần đã lưu", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await start(h, setId, { durationSec: 60 });
    const q = snapshot(h, a.attempt.id);
    const done = await h.mock.submit(AUTHOR, a.attempt.id, { answers: [{ ...right(q[0]), timeMs: 0 }, { ...right(q[1]), timeMs: 0 }] });
    expect(done.attempt).toMatchObject({ correctCount: 2, scorePct: 100 });

    const b = await start(h, setId, { durationSec: 60 });
    h.clock.now = new Date(new Date(b.expiresAt).getTime() + GRACE_MS + 1);
    const late = await h.mock.submit(AUTHOR, b.attempt.id, { answers: [{ ...right(snapshot(h, b.attempt.id)[0]), timeMs: 0 }] });
    expect(late).toMatchObject({ lateAnswersIgnored: true });
    expect(late.attempt).toMatchObject({ answeredCount: 0, correctCount: 0 });
  });

  it("ghi nhận rời app: BACKGROUND + FOREGROUND cộng backgroundCount/backgroundMs; trùng clientEventId bỏ qua; đã nộp → bỏ qua êm; không ảnh hưởng điểm", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    const a = await start(h, setId);
    const t0 = new Date(h.clock.now.getTime() + 10_000);
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);

    await h.mock.recordEvent(AUTHOR, a.attempt.id, { type: "BACKGROUND", at: t0, clientEventId: "evt-bg-0001" });
    await h.mock.recordEvent(AUTHOR, a.attempt.id, { type: "BACKGROUND", at: t0, clientEventId: "evt-bg-0001" }); // trùng
    await h.mock.recordEvent(AUTHOR, a.attempt.id, { type: "FOREGROUND", at: new Date(t0.getTime() + 48_000), clientEventId: "evt-fg-0001" });
    expect(h.attempts.rows.get(a.attempt.id)).toMatchObject({ backgroundCount: 1, backgroundMs: 48_000, lastBackgroundAt: null, eventCount: 2 });

    const done = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(done.attempt).toMatchObject({ backgroundCount: 1, backgroundMs: 48_000, scorePct: 0 });
    await expect(h.mock.recordEvent(AUTHOR, a.attempt.id, { type: "BACKGROUND", at: t0, clientEventId: "evt-bg-0002" })).resolves.toBeUndefined();
    expect(h.attempts.rows.get(a.attempt.id)?.backgroundCount).toBe(1);
  });

  it("lịch sử: chỉ lượt của tôi, mới → cũ, phân trang cursor; người xem bộ khác không thấy lượt của tôi", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 1);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const a = await start(h, setId);
      await h.mock.submit(AUTHOR, a.attempt.id, {});
      ids.push(a.attempt.id);
      h.clock.now = new Date(h.clock.now.getTime() + 1000);
    }
    const page1 = await h.mock.listBySet(AUTHOR, setId, { limit: 2 });
    expect(page1.data.map((x) => x.id)).toEqual([ids[2], ids[1]]);
    expect(page1.meta).toMatchObject({ hasMore: true, limit: 2 });
    const page2 = await h.mock.listBySet(AUTHOR, setId, { limit: 2, cursor: page1.meta.nextCursor as string });
    expect(page2.data.map((x) => x.id)).toEqual([ids[0]]);
    expect((await h.mock.listMine(MEMBER, { limit: 10 })).data).toHaveLength(0);
  });

  it("đề chụp SNAPSHOT: sửa/xoá bộ sau khi bắt đầu không đổi đề hay kết quả", async () => {
    const h = makeLearningHarness();
    const { setId, version, items } = await seedQuizSet(h, 2);
    const a = await start(h, setId);
    const q = snapshot(h, a.attempt.id);
    await h.bulk.save(AUTHOR, setId, { expectedVersion: version, upsert: [mc("moi")], delete: items.map((i) => i.id) } as never);
    await h.setService.remove(AUTHOR, setId);

    await h.mock.putAnswers(AUTHOR, a.attempt.id, { answers: q.map((x) => ({ ...right(x), timeMs: 0 })) });
    const done = await h.mock.submit(AUTHOR, a.attempt.id, {});
    expect(done.attempt).toMatchObject({ correctCount: 2, scorePct: 100, setTitle: "Bộ thi thử" });
    expect(done.questions).toHaveLength(2);
  });
});
