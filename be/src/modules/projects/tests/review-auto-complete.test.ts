import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { TaskReview, TaskReviewRound } from "../entities/task-review.interface";
import type { Task } from "../entities/task.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

/**
 * P1 `autoCompleteOnApproval` (p4-05 be.md §5.3 bước 5): lượt vừa đóng APPROVED ⇒ hệ thống chuyển thẻ sang DONE qua ĐÚNG đường `move`
 * (policy + effect + activity + outbox), trong cùng transaction với lần duyệt.
 */
describe("ReviewAutoComplete — tự chuyển Done khi đủ duyệt", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;
  let task: Task;
  let round: TaskReviewRound;
  let reviews: TaskReview[];

  const asUser = (r: TaskReview): AuthUser => userOf(r.reviewerId);
  const approve = (r: TaskReview) => h.submitService.submit(asUser(r), r.id, { status: "APPROVED", rubricScores: [], score10: 9, expectedVersion: r.version });
  const fresh = async (): Promise<Task> => (await h.tasks.findById(task.id)) as Task;
  const completedRows = () => h.outbox.events.filter((e) => e.type === "task.completed");

  async function setup(autoCompleteOnApproval: boolean, required = 2, extra = 2): Promise<void> {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    for (let i = 0; i < extra; i++) h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: required, autoCompleteOnApproval });
    const t = await h.addTask(owner, board, "Thẻ tự hoàn thành");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    task = await h.moveTo(an, board, task, "REVIEW");
    round = (await h.currentRound(task.id))!;
    reviews = await h.reviewsOf(round);
    h.emitter.events.length = 0;
    h.outbox.events.length = 0;
    h.activities.activities.length = 0;
  }

  it("tắt (mặc định): đủ duyệt vẫn ở REVIEW, không move, không task.completed", async () => {
    await setup(false);
    await approve(reviews[0]);
    const last = await approve(reviews[1]);

    expect(last.round.status).toBe("APPROVED");
    expect(last.task).toMatchObject({ reviewState: "APPROVED", columnKind: "REVIEW" });
    expect(completedRows()).toHaveLength(0);
    expect(h.emitter.of("task:moved")).toHaveLength(0);
  });

  it("bật: chưa đủ (1/2) thì chưa move; lượt duyệt đủ (2/2) ⇒ thẻ sang DONE cuối cột, completedAt/completionCount, MOVED actor null, task.completed kèm review.approved", async () => {
    await setup(true);
    const doneCol = h.columnId(board, "DONE");

    const first = await approve(reviews[0]);
    expect(first.task).toMatchObject({ reviewState: "PENDING", columnKind: "REVIEW" });
    expect(completedRows()).toHaveLength(0);

    const last = await approve(reviews[1]);
    expect(last.round).toMatchObject({ status: "APPROVED", approvedCount: 2 });
    expect(last.task).toMatchObject({ id: task.id, reviewState: "APPROVED", columnKind: "DONE", columnId: doneCol });

    const stored = await fresh();
    expect(stored).toMatchObject({ columnKind: "DONE", columnId: doneCol, reviewState: "APPROVED", completionCount: 1, version: task.version + 1 });
    expect(stored.completedAt).not.toBeNull();

    const moved = h.activities.activities.find((a) => a.type === "MOVED");
    expect(moved).toMatchObject({ actorId: null, before: { columnKind: "REVIEW" }, after: { columnKind: "DONE" } });

    expect(completedRows()).toHaveLength(1);
    const payload = completedRows()[0].payload as unknown as TaskCompletedPayload;
    expect(payload).toMatchObject({ taskId: task.id, actorId: null, assigneeIds: [an.id], completionCount: 1 });
    expect(payload.review).toMatchObject({ enabled: true, approved: true, roundId: round.id, waived: false });
    expect(completedRows()[0].dedupeKey).toBe(`task.completed:task:${task.id}:c1`);

    // Realtime sau commit: thẻ dịch cột (actorId null) + nhật ký MOVED, không mang điểm.
    expect(h.emitter.of("task:moved")[0].payload).toMatchObject({ id: task.id, columnKind: "DONE", actorId: null });
    expect(h.emitter.of("task:activity").some((e) => (e.payload as { activity: { type: string } }).activity.type === "MOVED")).toBe(true);
    expect(h.emitter.of("task:review-updated").slice(-1)[0].payload).toMatchObject({ taskId: task.id, status: "APPROVED" });
  });

  it("đặt CUỐI cột DONE (sau các thẻ đã có ở đó)", async () => {
    await setup(true, 1);
    const doneCol = h.columnId(board, "DONE");
    const t2 = await h.addTask(owner, board, "Đã xong khác");
    h.setTask(t2.id, { columnId: doneCol, columnKind: "DONE", position: "a5", completedAt: new Date(), completionCount: 1 });

    await approve(reviews[0]);

    const stored = await fresh();
    expect(stored.columnKind).toBe("DONE");
    expect(stored.position > "a5").toBe(true);
  });

  it("idempotent: nộp lại/lượt đã đóng → REVIEW_001, không hoàn thành lần hai; gọi trực tiếp sau khi đã DONE → null, không ghi gì", async () => {
    await setup(true, 1);
    await approve(reviews[0]);
    const after = await fresh();
    expect(after.columnKind).toBe("DONE");

    await expect(approve({ ...reviews[0], version: 2 })).rejects.toMatchObject({ errorCode: "REVIEW_001" });
    const again = await h.runner.run(board.id, (tx) => h.autoComplete.complete(tx, { task: after, board }));
    expect(again).toBeNull();
    expect(completedRows()).toHaveLength(1);
    expect((await fresh()).version).toBe(after.version);
    expect(h.activities.activities.filter((a) => a.type === "MOVED")).toHaveLength(1);
  });

  it("chỉ tự chuyển khi thẻ còn ở cột REVIEW (đã bị kéo đi nơi khác ⇒ không đụng)", async () => {
    await setup(true, 1);
    h.setTask(task.id, { columnId: h.columnId(board, "IN_PROGRESS"), columnKind: "IN_PROGRESS" });
    const out = await h.runner.run(board.id, (tx) => h.autoComplete.complete(tx, { task, board: h.boards.boards.get(board.id)! }));
    expect(out).toBeNull();
    expect(completedRows()).toHaveLength(0);
  });

  it("bảng tắt chấm chéo hoặc tắt tuỳ chọn ⇒ không làm gì; bảng không còn cột DONE ⇒ lượt vẫn đóng APPROVED nhưng thẻ ở lại", async () => {
    await setup(true, 1);
    const b = h.boards.boards.get(board.id)!;
    b.columns = b.columns.filter((c) => c.kind !== "DONE");
    const res = await approve(reviews[0]);
    expect(res.round.status).toBe("APPROVED");
    expect(res.task.columnKind).toBe("REVIEW");
    expect(completedRows()).toHaveLength(0);

    h.setBoardReview(board.id, { enabled: false, requiredReviews: 1, rubric: [], preventSelfReview: true, autoCompleteOnApproval: true });
    expect(await h.runner.run(board.id, (tx) => h.autoComplete.complete(tx, { task, board: h.boards.boards.get(board.id)! }))).toBeNull();
  });

  it("Yêu cầu sửa không bao giờ tự chuyển Done (thẻ về IN_PROGRESS như cũ)", async () => {
    await setup(true, 1);
    const res = await h.submitService.submit(asUser(reviews[0]), reviews[0].id, { status: "REQUEST_CHANGES", rubricScores: [], score10: 3, feedback: "Sửa", expectedVersion: 1 });
    expect(res.task.columnKind).toBe("IN_PROGRESS");
    expect(completedRows()).toHaveLength(0);
  });

  it("policy VẪN chạy: một policy khác chặn DONE ⇒ nộp chấm ném lỗi (cả transaction rollback ở DB thật), thẻ không sang DONE", async () => {
    await setup(true, 1);
    const err = Object.assign(new Error("Bị chặn bởi policy khác"), { statusCode: 409, errorCode: "TASK_002" });
    h.registry.registerPolicy({ name: "test.blocker", check: () => Promise.reject(err) });

    await expect(approve(reviews[0])).rejects.toMatchObject({ errorCode: "TASK_002" });
    expect((await fresh()).columnKind).toBe("REVIEW"); // move chưa ghi (policy chạy TRƯỚC moveCas)
    expect(completedRows()).toHaveLength(0);
  });

  describe("đường giao lại: người chấm còn lại rời nhóm, đủ số đã duyệt", () => {
    it("bật: requiredReviews giảm bằng approvedCount ⇒ lượt APPROVED và thẻ tự sang DONE; reconcile phát task:moved", async () => {
      await setup(true, 2, 1); // ứng viên: owner + 1 người ⇒ đúng hai người chấm, không ai thay được
      const [approver, leaver] = reviews;
      await approve(approver);
      h.emitter.events.length = 0;
      h.outbox.events.length = 0;
      h.directory.members.delete(leaver.reviewerId);
      h.directory.admins.delete(leaver.reviewerId);

      expect(await h.reconcileService.reassignForUsers(h.workspaceId, [leaver.reviewerId])).toBe(1);

      expect(await h.roundRepo.findById(round.id)).toMatchObject({ status: "APPROVED", requiredReviews: 1, approvedCount: 1, shortage: true, autoApproved: false });
      const stored = await fresh();
      expect(stored).toMatchObject({ columnKind: "DONE", reviewState: "APPROVED", completionCount: 1 });
      expect(completedRows()).toHaveLength(1);
      expect((completedRows()[0].payload as unknown as TaskCompletedPayload).review).toMatchObject({ enabled: true, approved: true, roundId: round.id });
      expect(h.emitter.of("task:moved")[0].payload).toMatchObject({ id: task.id, columnKind: "DONE", actorId: null });

      // Quét lại (cron) không đổi gì.
      expect(await h.reconcileService.reassignForUsers(h.workspaceId, [leaver.reviewerId])).toBe(0);
      expect(completedRows()).toHaveLength(1);
    });

    it("lượt tự duyệt vì KHÔNG còn người chấm nào (chưa ai duyệt thật) ⇒ không tự chuyển Done", async () => {
      await setup(true, 2, 0); // ứng viên duy nhất: owner
      expect(reviews).toHaveLength(1);
      h.directory.members.delete(reviews[0].reviewerId);
      h.directory.admins.delete(reviews[0].reviewerId);
      await h.reconcileService.reassignForUsers(h.workspaceId, [reviews[0].reviewerId]);

      expect(await h.roundRepo.findById(round.id)).toMatchObject({ status: "APPROVED", autoApproved: true });
      expect((await fresh()).columnKind).toBe("REVIEW");
      expect(completedRows()).toHaveLength(0);
    });
  });
});
