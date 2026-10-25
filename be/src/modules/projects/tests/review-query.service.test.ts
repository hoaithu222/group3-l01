import type { AuthUser } from "../../../core/types/express";
import type { SubmitReviewDto } from "../dtos";
import type { Board } from "../entities/board.interface";
import type { TaskReview } from "../entities/task-review.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import type { Task } from "../entities/task.interface";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

const SCORE = { status: "APPROVED" as const, rubricScores: [] as never[], score10: 8.5, feedback: "Nhận xét riêng" };
const submit = (h: ReviewHarness, r: TaskReview, over: Partial<SubmitReviewDto> = {}) =>
  h.submitService.submit(userOf(r.reviewerId), r.id, { ...SCORE, expectedVersion: r.version, ...over });

describe("ReviewQueryService.forTask — ai thấy gì (PM2-32)", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let bystander: AuthUser;
  let board: Board;
  let task: Task;
  let reviews: TaskReview[];

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    for (let i = 0; i < 3; i++) h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2 });
    const t = await h.addTask(owner, board, "Thẻ xem chấm");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    await h.moveTo(an, board, task, "REVIEW");
    reviews = await h.reviewsOf((await h.currentRound(task.id))!);
    // MEMBER khác: một người không phải người làm, không phải người chấm.
    const chosen = new Set(reviews.map((r) => r.reviewerId));
    const spare = [...h.roles.keys()].find((id) => id !== an.id && id !== owner.id && !chosen.has(id) && h.roles.get(id) === "MEMBER");
    bystander = spare ? userOf(spare) : h.addUser("MEMBER");
  });

  it("thẻ chưa có lượt: bảng tắt → enabled:false, không currentRound; chưa từng vào REVIEW → currentRound null", async () => {
    const off = await h.reviewBoard(owner, { enabled: false });
    const t = await h.addTask(owner, off, "Chưa chấm");
    expect(await h.queryService.forTask(owner, t.id)).toEqual({ enabled: false, requiredReviews: 2, currentRound: null, history: [], myReview: null, myPermissions: { submit: false, reassign: false, waive: false } });
  });

  it("MEMBER khác: thấy lượt, số duyệt, tên người chấm — KHÔNG có score10/feedback; status review đã nộp bị che; không có quyền nào", async () => {
    await submit(h, reviews[0]);
    const view = await h.queryService.forTask(bystander, task.id);
    expect(view.enabled).toBe(true);
    expect(view.currentRound).toMatchObject({ status: "OPEN", approvedCount: 1, requiredReviews: 2 });
    const done = view.currentRound!.reviews.find((r) => r.id === reviews[0].id)!;
    expect(done.status).toBe("SUBMITTED");
    expect(done).not.toHaveProperty("score10");
    expect(done).not.toHaveProperty("feedback");
    expect(JSON.stringify(view)).not.toContain("Nhận xét riêng");
    expect(view.myReview).toBeNull();
    expect(view.myPermissions).toEqual({ submit: false, reassign: false, waive: false });
  });

  it("người chấm CHƯA nộp: không thấy kết quả của người kia, thấy review của mình và được nộp; nộp xong thì thấy cả hai", async () => {
    // ⚠️ Người chấm được chọn theo băm id NGẪU NHIÊN và OWNER cũng là ứng viên; OWNER (admin) luôn được xem kết quả — đúng luật — nên
    // người XEM ở ca này phải là MEMBER, không thì ~1/4 lượt chạy đỏ oan ("SUBMITTED" ≠ "APPROVED").
    const [first, other] = reviews[1].reviewerId === owner.id ? [reviews[1], reviews[0]] : [reviews[0], reviews[1]];
    await submit(h, first);
    const before = await h.queryService.forTask(userOf(other.reviewerId), task.id);
    expect(before.myReview).toMatchObject({ id: other.id, status: "PENDING" });
    expect(before.myPermissions).toMatchObject({ submit: true });
    const seenFirst = before.currentRound!.reviews.find((r) => r.id === first.id)!;
    expect(seenFirst.status).toBe("SUBMITTED");
    expect(seenFirst).not.toHaveProperty("score10");

    await submit(h, other, { score10: 9 });
    const after = await h.queryService.forTask(userOf(other.reviewerId), task.id);
    expect(after.currentRound!.reviews.find((r) => r.id === first.id)).toMatchObject({ status: "APPROVED", score10: 8.5, feedback: "Nhận xét riêng" });
    expect(after.myPermissions.submit).toBe(false); // lượt đã đóng
  });

  it("người làm và OWNER/ADMIN thấy đủ điểm + nhận xét + quyết định; OWNER có quyền giao lại/miễn khi lượt đang mở", async () => {
    await submit(h, reviews[0]);
    for (const viewer of [an, owner]) {
      const view = await h.queryService.forTask(viewer, task.id);
      expect(view.currentRound!.reviews.find((r) => r.id === reviews[0].id)).toMatchObject({ status: "APPROVED", score10: 8.5, feedback: "Nhận xét riêng" });
    }
    // OWNER cũng có thể được chọn chấm (băm id ngẫu nhiên): chỉ review CÒN CHỜ mới cho nộp — nếu chính OWNER vừa nộp `reviews[0]` ở
    // trên thì `submit` là false (trước đây kỳ vọng `true` ⇒ ~1/4 lượt chạy đỏ oan).
    const ownerPending = reviews.some((r) => r.reviewerId === owner.id && r.id !== reviews[0].id);
    expect((await h.queryService.forTask(owner, task.id)).myPermissions).toEqual({ submit: ownerPending, reassign: true, waive: true });
    expect((await h.queryService.forTask(an, task.id)).myPermissions).toEqual({ submit: false, reassign: false, waive: false });
  });

  it("lịch sử: lượt mới nhất là currentRound, các lượt cũ trong history mới → cũ; lượt cũ vẫn lọc theo người xem", async () => {
    await submit(h, reviews[0], { status: "REQUEST_CHANGES", feedback: "Vòng một cần sửa" });
    await h.moveTo(an, board, task, "REVIEW");
    const view = await h.queryService.forTask(bystander, task.id);
    expect(view.currentRound).toMatchObject({ round: 2, status: "OPEN" });
    expect(view.history.map((r) => r.round)).toEqual([1]);
    expect(view.history[0]).toMatchObject({ status: "CHANGES_REQUESTED" });
    expect(JSON.stringify(view)).not.toContain("Vòng một cần sửa");
    const asOwner = await h.queryService.forTask(owner, task.id);
    expect(asOwner.history[0].reviews.find((r) => r.status === "REQUEST_CHANGES")).toMatchObject({ feedback: "Vòng một cần sửa" });
  });

  it("GUEST → 404; người ngoài nhóm → 404; bảng lưu trữ → chỉ đọc (myPermissions rỗng)", async () => {
    await expect(h.queryService.forTask(h.addUser("GUEST"), task.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.queryService.forTask(userOf("0".repeat(23) + "9"), task.id)).rejects.toMatchObject({ statusCode: 404 });
    h.boards.boards.get(board.id)!.archivedAt = new Date();
    const view = await h.queryService.forTask(userOf(reviews[0].reviewerId), task.id);
    expect(view.myPermissions).toEqual({ submit: false, reassign: false, waive: false });
  });

  it("lượt được miễn: hiển thị lý do và người miễn cho mọi thành viên; lượt tự duyệt hiển thị autoApproved", async () => {
    await h.waiveService.waive(owner, task.id, { reason: "Thẻ khẩn cấp, chủ nhóm đã kiểm tra tay" });
    const view = await h.queryService.forTask(bystander, task.id);
    expect(view.currentRound).toMatchObject({ status: "WAIVED", waived: { by: { id: owner.id }, reason: "Thẻ khẩn cấp, chủ nhóm đã kiểm tra tay" } });
    expect(view.myPermissions).toEqual({ submit: false, reassign: false, waive: false });
  });
});

describe("ReviewWaiveService — miễn chấm", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;
  let task: Task;
  let reviews: TaskReview[];

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2 });
    const t = await h.addTask(owner, board, "Thẻ khẩn");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    await h.moveTo(an, board, task, "REVIEW");
    reviews = await h.reviewsOf((await h.currentRound(task.id))!);
    h.outbox.events.length = 0;
    h.emitter.events.length = 0;
  });

  it("OWNER miễn: lượt WAIVED (waivedBy/waiveReason), review chờ CANCELLED (MANUAL), reviewState APPROVED, audit, activity, outbox round-closed; thẻ sang DONE được (review.waived)", async () => {
    const res = await h.waiveService.waive(owner, task.id, { reason: "Chủ nhóm đã kiểm tra trực tiếp" });

    expect(res).toMatchObject({ status: "WAIVED", closeReason: "WAIVED", waived: { by: { id: owner.id }, reason: "Chủ nhóm đã kiểm tra trực tiếp" } });
    expect(res.reviews.every((r) => r.status === "CANCELLED" && r.cancelReason === "MANUAL")).toBe(true);
    expect((await h.tasks.findById(task.id))!.reviewState).toBe("APPROVED");
    expect(h.audit.records).toEqual([expect.objectContaining({ action: "task-review.waive", actorId: owner.id, targetType: "TaskReviewRound", reason: "Chủ nhóm đã kiểm tra trực tiếp", metadata: { taskId: task.id, round: 1 } })]);
    expect(h.activities.activities.find((a) => a.type === "REVIEW_WAIVED")).toMatchObject({ actorId: owner.id });
    expect(h.outbox.events.find((e) => e.type === "review.round-closed")?.payload).toMatchObject({ status: "WAIVED", actorId: owner.id, assigneeIds: [an.id] });
    expect([...h.reminders.cancelled[0].reviewIds].sort()).toEqual(reviews.map((r) => r.id).sort());
    expect(h.emitter.of("task:review-updated")[0].payload).toMatchObject({ status: "WAIVED" });

    await h.moveTo(an, board, task, "DONE");
    const completed = h.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(completed.review).toMatchObject({ enabled: true, approved: true, waived: true, autoApproved: false });
  });

  it("REVIEW_007 khi thẻ không có lượt mở (chưa vào REVIEW hoặc đã đóng); MEMBER → 403; GUEST → 404", async () => {
    await h.waiveService.waive(owner, task.id, { reason: "Miễn chấm lần một cho thẻ" });
    await expect(h.waiveService.waive(owner, task.id, { reason: "Miễn chấm lần hai không còn lượt" })).rejects.toMatchObject({ statusCode: 409, errorCode: "REVIEW_007" });

    const other = await h.addTask(owner, board, "Chưa vào REVIEW");
    await expect(h.waiveService.waive(owner, other.id, { reason: "Chưa có lượt nào để miễn" })).rejects.toMatchObject({ errorCode: "REVIEW_007" });
    await expect(h.waiveService.waive(an, task.id, { reason: "Không đủ quyền để miễn" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.waiveService.waive(h.addUser("GUEST"), task.id, { reason: "Khách không thấy bảng" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("ReviewQueryService.mine — hộp Cần chấm của tôi", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;
  let reviewer: AuthUser;
  const taskIds: string[] = [];

  beforeEach(async () => {
    taskIds.length = 0;
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    reviewer = h.addUser("MEMBER");
    // Chỉ `reviewer` là ứng viên: chủ nhóm và An không được chọn.
    h.directory.inactive.add(owner.id);
    board = await h.reviewBoard(owner, { requiredReviews: 1 });
    h.directory.boardNameMap.set(board.id, "Đồ án cuối kỳ");
    for (const title of ["Thẻ A", "Thẻ B", "Thẻ C"]) {
      const t = await h.addTask(owner, board, title);
      h.setTask(t.id, { assigneeIds: [an.id] });
      await h.moveTo(an, board, t, "REVIEW");
      taskIds.push(t.id);
    }
  });

  it("PENDING: mới → cũ, kèm thẻ/bảng/nhóm và tiến độ lượt; phân trang cursor", async () => {
    const first = await h.queryService.mine(reviewer, { status: "PENDING", limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.meta).toMatchObject({ hasMore: true, limit: 2, nextCursor: expect.any(String) });
    expect(first.data[0]).toMatchObject({
      status: "PENDING",
      submittedAt: null,
      task: { boardId: board.id, boardName: "Đồ án cuối kỳ", workspaceId: h.workspaceId, workspaceName: "Nhóm test", columnKind: "REVIEW" },
      round: { round: 1, approvedCount: 0, requiredReviews: 1 },
    });
    const second = await h.queryService.mine(reviewer, { status: "PENDING", limit: 2, cursor: first.meta.nextCursor! });
    expect(second.data).toHaveLength(1);
    expect(second.meta).toMatchObject({ hasMore: false, nextCursor: null });
    expect(new Set([...first.data, ...second.data].map((r) => r.task.id))).toEqual(new Set(taskIds));
  });

  it("SUBMITTED: chỉ review đã nộp (kèm quyết định thật của mình); PENDING không còn review đã nộp", async () => {
    const [mine] = await h.reviewRepo.listMine(reviewer.id, "PENDING", null, 1);
    await h.submitService.submit(reviewer, mine.review.id, { status: "REQUEST_CHANGES", rubricScores: [], score10: 4, feedback: "Cần sửa", expectedVersion: mine.review.version });
    const done = await h.queryService.mine(reviewer, { status: "SUBMITTED", limit: 10 });
    expect(done.data).toHaveLength(1);
    expect(done.data[0]).toMatchObject({ reviewId: mine.review.id, status: "REQUEST_CHANGES" });
    expect(done.data[0].submittedAt).not.toBeNull();
    expect((await h.queryService.mine(reviewer, { status: "PENDING", limit: 10 })).data.map((r) => r.reviewId)).not.toContain(mine.review.id);
  });

  it("bỏ mục của nhóm đã rời và thẻ đã xoá; người khác không thấy hộp của tôi", async () => {
    h.setTask(taskIds[0], { deletedAt: new Date() });
    expect((await h.queryService.mine(reviewer, { status: "PENDING", limit: 10 })).data.map((r) => r.task.id).sort()).toEqual([taskIds[1], taskIds[2]].sort());
    h.directory.members.delete(reviewer.id);
    expect((await h.queryService.mine(reviewer, { status: "PENDING", limit: 10 })).data).toEqual([]);
    expect((await h.queryService.mine(owner, { status: "PENDING", limit: 10 })).data).toEqual([]);
  });
});
