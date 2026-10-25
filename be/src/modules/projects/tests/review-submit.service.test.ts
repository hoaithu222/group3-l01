import type { AuthUser } from "../../../core/types/express";
import { reviewSubmittedSchema } from "../../../shared/events/domain-events";
import type { SubmitReviewDto } from "../dtos";
import type { Board } from "../entities/board.interface";
import type { RubricCriterion, TaskReview, TaskReviewRound } from "../entities/task-review.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import type { Task } from "../entities/task.interface";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

const RUBRIC: RubricCriterion[] = [
  { id: "r_AAAAAA", label: "Đúng yêu cầu", description: null, maxScore: 4 },
  { id: "r_BBBBBB", label: "Chất lượng mã", description: null, maxScore: 3 },
  { id: "r_CCCCCC", label: "Trình bày", description: null, maxScore: 3 },
];
const FULL = RUBRIC.map((c) => ({ criterionId: c.id, score: c.maxScore }));

describe("ReviewSubmitService — nộp chấm (PM2-29, PM2-31)", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;
  let task: Task;
  let round: TaskReviewRound;
  let reviews: TaskReview[];

  const asUser = (r: TaskReview): AuthUser => userOf(r.reviewerId);
  const dto = (r: TaskReview, over: Partial<SubmitReviewDto> = {}): SubmitReviewDto => ({
    status: "APPROVED",
    rubricScores: FULL,
    feedback: undefined,
    expectedVersion: r.version,
    ...over,
  });
  const reload = async (): Promise<void> => {
    round = (await h.currentRound(task.id))!;
    reviews = await h.reviewsOf(round);
  };

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    for (let i = 0; i < 3; i++) h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2, rubric: RUBRIC });
    const t = await h.addTask(owner, board, "Thẻ chấm");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    await h.moveTo(an, board, task, "REVIEW");
    await reload();
    h.emitter.events.length = 0;
    h.outbox.events.length = 0;
  });

  it("PM2-31: rubric 4 + 3 + 3, chấm 3 + 3 + 2 → score10 = 8,0; review APPROVED; lượt 1/2; đúng MỘT bản ghi", async () => {
    const [first] = reviews;
    const res = await h.submitService.submit(asUser(first), first.id, dto(first, { rubricScores: [{ criterionId: "r_AAAAAA", score: 3 }, { criterionId: "r_BBBBBB", score: 3 }, { criterionId: "r_CCCCCC", score: 2 }], feedback: "Gọn gàng" }));

    expect(res.review).toMatchObject({ id: first.id, status: "APPROVED", score10: 8, feedback: "Gọn gàng", version: 2 });
    expect(res.round).toMatchObject({ status: "OPEN", approvedCount: 1, requiredReviews: 2 });
    expect(res.task).toMatchObject({ id: task.id, reviewState: "PENDING", columnKind: "REVIEW" });
    const stored = (await h.reviewRepo.findById(first.id))!;
    expect(stored).toMatchObject({ status: "APPROVED", score10: 8, version: 2 });
    expect(stored.submittedAt).not.toBeNull();
    expect(stored.rubricScores).toEqual([
      { criterionId: "r_AAAAAA", score: 3 },
      { criterionId: "r_BBBBBB", score: 3 },
      { criterionId: "r_CCCCCC", score: 2 },
    ]);
    expect(h.store.reviews.size).toBe(2);
  });

  it("outbox review.submitted: MỘT dòng cho XP (gamification/xp.consume) + MỘT dòng riêng cho đóng góp (reports/contribution.review-fact), payload khớp schema dùng chung, KHÔNG có nhận xét", async () => {
    const [first] = reviews;
    await h.submitService.submit(asUser(first), first.id, dto(first, { feedback: "Rất riêng tư" }));

    const rows = h.outbox.events.filter((e) => e.type === "review.submitted");
    expect(rows.map((r) => [r.queue, r.jobName, r.dedupeKey]).sort()).toEqual([
      ["gamification", "xp.consume", `review.submitted:review:${first.id}`],
      ["reports", "contribution.review-fact", `contribution.review-fact:review:${first.id}`],
    ]);
    for (const row of rows) {
      const parsed = reviewSubmittedSchema.parse(row.payload);
      expect(parsed).toMatchObject({ reviewId: first.id, taskId: task.id, boardId: board.id, workspaceId: h.workspaceId, roundId: round.id, reviewerId: first.reviewerId, assigneeIds: [an.id], status: "APPROVED", score10: 10 });
      expect(JSON.stringify(row.payload)).not.toContain("Rất riêng tư");
    }
    expect(h.activities.activities.find((a) => a.type === "REVIEW_SUBMITTED")).toMatchObject({ actorId: first.reviewerId, after: { reviewId: first.id, roundId: round.id, status: "APPROVED" } });
    expect(JSON.stringify(h.activities.activities.filter((a) => a.type === "REVIEW_SUBMITTED"))).not.toContain("score");
  });

  it("đủ số lượt duyệt → lượt APPROVED, reviewState APPROVED, outbox review.round-closed, thẻ sang DONE được (task.completed.review.approved)", async () => {
    const [a, b] = reviews;
    await h.submitService.submit(asUser(a), a.id, dto(a));
    const last = await h.submitService.submit(asUser(b), b.id, dto(b));

    expect(last.round).toMatchObject({ status: "APPROVED", approvedCount: 2, closeReason: "APPROVED" });
    expect(last.task.reviewState).toBe("APPROVED");
    expect((await h.roundRepo.findById(round.id))).toMatchObject({ status: "APPROVED", activeKey: `round:${round.id}` });
    expect(h.outbox.events.find((e) => e.type === "review.round-closed")?.payload).toMatchObject({ status: "APPROVED", assigneeIds: [an.id], actorId: b.reviewerId, autoApproved: false });

    await h.moveTo(an, board, task, "DONE");
    const completed = h.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(completed.review).toMatchObject({ enabled: true, approved: true, roundId: round.id, waived: false });
  });

  it("PM2-29: Yêu cầu sửa thiếu nhận xét → 400 REVIEW_006 (không đổi gì); có nhận xét → lượt CHANGES_REQUESTED, review chờ còn lại CANCELLED, thẻ về IN_PROGRESS do hệ thống", async () => {
    const [a, b] = reviews;
    await h.submitService.submit(asUser(a), a.id, dto(a));
    h.emitter.events.length = 0;

    await expect(h.submitService.submit(asUser(b), b.id, dto(b, { status: "REQUEST_CHANGES", feedback: undefined }))).rejects.toMatchObject({ statusCode: 400, errorCode: "REVIEW_006", details: { feedback: expect.any(Array) } });
    await expect(h.submitService.submit(asUser(b), b.id, dto(b, { status: "REQUEST_CHANGES", feedback: "   " }))).rejects.toMatchObject({ errorCode: "REVIEW_006" });
    expect((await h.reviewRepo.findById(b.id))!.status).toBe("PENDING");

    const res = await h.submitService.submit(asUser(b), b.id, dto(b, { status: "REQUEST_CHANGES", rubricScores: RUBRIC.map((c) => ({ criterionId: c.id, score: 1 })), feedback: "Cần thêm kiểm thử" }));
    expect(res.round).toMatchObject({ status: "CHANGES_REQUESTED", closeReason: "CHANGES_REQUESTED" });
    expect(res.task).toMatchObject({ reviewState: "CHANGES_REQUESTED", columnKind: "IN_PROGRESS", columnId: h.columnId(board, "IN_PROGRESS") });
    // Điểm thấp vẫn được ghi (thang chung) nhưng lượt không tính là duyệt.
    expect(res.review).toMatchObject({ status: "REQUEST_CHANGES", score10: 3, feedback: "Cần thêm kiểm thử" });

    const moved = (await h.tasks.findById(task.id))!;
    expect(moved).toMatchObject({ columnKind: "IN_PROGRESS", reviewState: "CHANGES_REQUESTED", version: task.version + 2 });
    expect(h.activities.activities.find((a) => a.type === "MOVED" && a.actorId === null)).toMatchObject({ before: { columnKind: "REVIEW" }, after: { columnKind: "IN_PROGRESS" } });
    expect(h.outbox.events.find((e) => e.type === "review.round-closed")?.payload).toMatchObject({ status: "CHANGES_REQUESTED", actorId: b.reviewerId });

    // Realtime sau commit: tiến độ lượt + thẻ + di chuyển (actorId null), KHÔNG mang điểm/nhận xét.
    expect(h.emitter.of("task:review-updated")[0].payload).toMatchObject({ taskId: task.id, status: "CHANGES_REQUESTED" });
    expect(h.emitter.of("task:updated")[0].payload).toMatchObject({ changed: ["review"] });
    expect(h.emitter.of("task:moved")[0].payload).toMatchObject({ id: task.id, columnKind: "IN_PROGRESS", actorId: null });
    expect(JSON.stringify(h.emitter.events)).not.toContain("Cần thêm kiểm thử");
  });

  it("PM2-29: nộp xong kéo lại vào REVIEW → lượt 2 ưu tiên đúng hai người chấm cũ", async () => {
    const [a, b] = reviews;
    await h.submitService.submit(asUser(a), a.id, dto(a));
    await h.submitService.submit(asUser(b), b.id, dto(b, { status: "REQUEST_CHANGES", feedback: "Sửa lại" }));
    await h.moveTo(an, board, task, "REVIEW");
    const r2 = (await h.currentRound(task.id))!;
    expect(r2.round).toBe(2);
    expect((await h.reviewsOf(r2)).map((r) => r.reviewerId).sort()).toEqual([a.reviewerId, b.reviewerId].sort());
  });

  it("REVIEW_001: nộp sau khi lượt đã đóng, nộp lần hai, hoặc người chấm bị huỷ → 409; version cũ → 409 RES_003", async () => {
    const [a, b] = reviews;
    await h.submitService.submit(asUser(a), a.id, dto(a));
    await expect(h.submitService.submit(asUser(a), a.id, dto(a))).rejects.toMatchObject({ statusCode: 409, errorCode: "REVIEW_001" });
    await expect(h.submitService.submit(asUser(b), b.id, dto(b, { expectedVersion: 99 }))).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 1 } });

    // Người kia Yêu cầu sửa → lượt đóng → review của b bị huỷ → b nộp = REVIEW_001.
    await h.reviewRepo.updatePendingCas(b.id, b.version, { status: "CANCELLED", cancelReason: "ROUND_CLOSED" });
    await h.roundRepo.updateCas(round.id, (await h.roundRepo.findById(round.id))!.version, { status: "CHANGES_REQUESTED", closedAt: new Date(), closeReason: "CHANGES_REQUESTED" });
    await expect(h.submitService.submit(asUser(b), b.id, dto(b, { expectedVersion: 2 }))).rejects.toMatchObject({ errorCode: "REVIEW_001" });
  });

  it("REVIEW_002: điểm vượt tối đa / thiếu tiêu chí → 400 kèm details từng tiêu chí, review vẫn PENDING", async () => {
    const [a] = reviews;
    const bad = dto(a, { rubricScores: [{ criterionId: "r_AAAAAA", score: 5 }, { criterionId: "r_BBBBBB", score: 3 }] });
    await expect(h.submitService.submit(asUser(a), a.id, bad)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "REVIEW_002",
      details: { criteria: { r_AAAAAA: "OUT_OF_RANGE", r_CCCCCC: "MISSING" } },
    });
    expect((await h.reviewRepo.findById(a.id))!.status).toBe("PENDING");
    expect(h.outbox.events.filter((e) => e.type === "review.submitted")).toHaveLength(0);
  });

  it("REVIEW_003: người chấm đang là người làm thẻ không thể nộp (đã được thêm vào người làm sau khi được giao)", async () => {
    const [a] = reviews;
    h.setTask(task.id, { assigneeIds: [an.id, a.reviewerId] });
    await expect(h.submitService.submit(asUser(a), a.id, dto(a))).rejects.toMatchObject({ statusCode: 409, errorCode: "REVIEW_003" });
    expect((await h.reviewRepo.findById(a.id))!.status).toBe("PENDING");
  });

  it("quyền: người không phải người chấm → 403; không thấy bảng (GUEST) → 404; review không tồn tại → 404; bảng lưu trữ → 403", async () => {
    const [a, b] = reviews;
    await expect(h.submitService.submit(asUser(b), a.id, dto(a))).rejects.toMatchObject({ statusCode: 403 });
    const guest = h.addUser("GUEST");
    await expect(h.submitService.submit(guest, a.id, dto(a))).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.submitService.submit(asUser(a), "0".repeat(24), dto(a))).rejects.toMatchObject({ statusCode: 404 });
    h.boards.boards.get(board.id)!.archivedAt = new Date(); // bảng lưu trữ: resolver BOARD chỉ còn quyền đọc
    await expect(h.submitService.submit(asUser(a), a.id, dto(a))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("không rubric: bắt buộc score10 (0–10, bước 0,5); rubric trống nên rubricScores phải rỗng", async () => {
    const plain = new ReviewHarness();
    const o = plain.addUser("OWNER");
    const a = plain.addUser("MEMBER");
    plain.addUser("MEMBER");
    plain.addUser("MEMBER");
    const bd = await plain.reviewBoard(o, { requiredReviews: 1 });
    const t = await plain.addTask(o, bd, "Không rubric");
    plain.setTask(t.id, { assigneeIds: [a.id] });
    await plain.moveTo(a, bd, t, "REVIEW");
    const [only] = await plain.reviewsOf((await plain.currentRound(t.id))!);
    const base = { status: "APPROVED" as const, rubricScores: [], expectedVersion: only.version };

    await expect(plain.submitService.submit(userOf(only.reviewerId), only.id, base)).rejects.toMatchObject({ errorCode: "REVIEW_002", details: { score10: "REQUIRED" } });
    await expect(plain.submitService.submit(userOf(only.reviewerId), only.id, { ...base, score10: 7.25 })).rejects.toMatchObject({ errorCode: "REVIEW_002", details: { score10: "INVALID_STEP" } });
    const ok = await plain.submitService.submit(userOf(only.reviewerId), only.id, { ...base, score10: 7.5 });
    expect(ok.review.score10).toBe(7.5);
    expect(ok.round.status).toBe("APPROVED"); // 1 lượt duyệt là đủ
  });

  it("hủy job nhắc của review đã nộp và các review bị đóng theo; kết quả trả cho người nộp có đủ điểm của lượt", async () => {
    const [a, b] = reviews;
    const res = await h.submitService.submit(asUser(b), b.id, dto(b, { status: "REQUEST_CHANGES", feedback: "Sửa" }));
    expect(h.reminders.cancelled.flatMap((c) => [...c.reviewIds]).sort()).toEqual([a.id, b.id].sort());
    expect(h.reminders.cancelled[0].hours).toEqual([24, 72]);
    // Người nộp (đã nộp) thấy kết quả của lượt.
    expect(res.round.reviews.find((r) => r.id === b.id)).toMatchObject({ status: "REQUEST_CHANGES", feedback: "Sửa" });
  });

  it("thẻ không có cột IN_PROGRESS: Yêu cầu sửa vẫn đóng lượt và đổi reviewState nhưng giữ nguyên cột", async () => {
    const [a] = reviews;
    const b0 = h.boards.boards.get(board.id)!;
    b0.columns = b0.columns.filter((c) => c.kind !== "IN_PROGRESS");
    const res = await h.submitService.submit(asUser(a), a.id, dto(a, { status: "REQUEST_CHANGES", feedback: "Sửa" }));
    expect(res.task).toMatchObject({ reviewState: "CHANGES_REQUESTED", columnKind: "REVIEW" });
    expect(h.emitter.of("task:moved")).toHaveLength(0);
  });
});
