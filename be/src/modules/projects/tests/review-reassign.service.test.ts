import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { TaskReview, TaskReviewRound } from "../entities/task-review.interface";
import type { Task } from "../entities/task.interface";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

interface Setup {
  h: ReviewHarness;
  owner: AuthUser;
  an: AuthUser;
  board: Board;
  task: Task;
  round: TaskReviewRound;
  reviews: TaskReview[];
  others: AuthUser[];
}

/** Nhóm gồm chủ nhóm, An (người làm) và `extra` thành viên nữa; lượt cần `required` người chấm. */
async function setup(extra: number, required: number): Promise<Setup> {
  const h = new ReviewHarness();
  const owner = h.addUser("OWNER");
  const an = h.addUser("MEMBER");
  const others = Array.from({ length: extra }, () => h.addUser("MEMBER"));
  const board = await h.reviewBoard(owner, { requiredReviews: required });
  const t = await h.addTask(owner, board, "Thẻ giao lại");
  h.setTask(t.id, { assigneeIds: [an.id] });
  const task = (await h.tasks.findById(t.id)) as Task;
  await h.moveTo(an, board, task, "REVIEW");
  const round = (await h.currentRound(task.id))!;
  const reviews = await h.reviewsOf(round);
  h.emitter.events.length = 0;
  h.outbox.events.length = 0;
  return { h, owner, an, board, task, round, reviews, others };
}

const leave = (h: ReviewHarness, userId: string): void => {
  h.directory.members.delete(userId);
  h.directory.admins.delete(userId);
};

describe("ReviewReassignService — giao lại thủ công (OWNER/ADMIN)", () => {
  it("giao cho người được chọn: review cũ REASSIGNED (MANUAL, replacedById), review mới PENDING assignedBy=admin; audit + activity + outbox + realtime", async () => {
    const s = await setup(3, 2); // ứng viên: owner + 3 người = 4; giao 2 → còn 2 người chưa được giao
    const chosen = new Set(s.reviews.map((r) => r.reviewerId));
    const spare = [s.owner, ...s.others].filter((u) => !chosen.has(u.id))[0];
    const [old] = s.reviews;

    const res = await s.h.reassignService.reassign(s.owner, old.id, { toUserId: spare.id, reason: "Bạn cũ đang bận thi cuối kỳ" });

    expect(res.cancelled).toMatchObject({ id: old.id, status: "REASSIGNED", cancelReason: "MANUAL" });
    expect(res.assigned).toMatchObject({ status: "PENDING", reviewer: { id: spare.id } });
    const oldStored = (await s.h.reviewRepo.findById(old.id))!;
    expect(oldStored).toMatchObject({ status: "REASSIGNED", cancelReason: "MANUAL", replacedById: res.assigned.id, version: 2 });
    expect(await s.h.reviewRepo.findById(res.assigned.id)).toMatchObject({ reviewerId: spare.id, assignedBy: s.owner.id, roundId: s.round.id });

    expect(s.h.audit.records).toEqual([
      expect.objectContaining({ action: "task-review.reassign", actorId: s.owner.id, targetType: "TaskReview", targetId: old.id, workspaceId: s.h.workspaceId, reason: "Bạn cũ đang bận thi cuối kỳ", metadata: expect.objectContaining({ from: old.reviewerId, to: spare.id }) }),
    ]);
    expect(s.h.activities.activities.find((a) => a.type === "REVIEW_REASSIGNED")).toMatchObject({ actorId: s.owner.id, before: { userId: old.reviewerId }, after: { userId: spare.id, cause: "MANUAL" } });
    const rows = s.h.outbox.events.map((e) => e.dedupeKey).sort();
    expect(rows).toEqual([`review.assigned:round:${s.round.id}:r${res.assigned.id}`, `review.cancelled:review:${old.id}`].sort());
    expect(s.h.emitter.of("task:review-updated")[0].payload).toMatchObject({ roundId: s.round.id, status: "OPEN", assignedCount: 2 });
    expect(s.h.reminders.cancelled[0].reviewIds).toEqual([old.id]);
  });

  it("không chỉ định toUserId → hệ thống tự chọn ứng viên cân tải (không người làm, không người đã có review trong lượt)", async () => {
    const s = await setup(3, 2);
    const res = await s.h.reassignService.reassign(s.owner, s.reviews[0].id, { reason: "Đổi người chấm cho đều việc" });
    expect([s.an.id, ...s.reviews.map((r) => r.reviewerId)]).not.toContain(res.assigned.reviewer.id);
  });

  it("toUserId không hợp lệ (người làm / đã có review trong lượt / không thuộc nhóm / GUEST) → 400 VAL_001 theo trường toUserId", async () => {
    const s = await setup(3, 2);
    const [first, second] = s.reviews;
    const guest = s.h.addUser("GUEST");
    const outsider = userOf("0".repeat(23) + "1");
    for (const toUserId of [s.an.id, second.reviewerId, guest.id, outsider.id]) {
      await expect(s.h.reassignService.reassign(s.owner, first.id, { toUserId, reason: "Lý do đủ dài để hợp lệ" })).rejects.toMatchObject({ statusCode: 400, details: { toUserId: expect.any(Array) } });
    }
    expect((await s.h.reviewRepo.findById(first.id))!.status).toBe("PENDING");
  });

  it("nhóm người chấm giới hạn: toUserId ngoài nhóm bị từ chối", async () => {
    const s = await setup(3, 2);
    const inPool = s.reviews.map((r) => r.reviewerId);
    s.h.setBoardReview(s.board.id, { enabled: true, requiredReviews: 2, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false, reviewerPool: inPool });
    const outside = [s.owner, ...s.others].find((u) => !inPool.includes(u.id))!;
    await expect(s.h.reassignService.reassign(s.owner, s.reviews[0].id, { toUserId: outside.id, reason: "Thử giao ngoài nhóm chấm" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("hết ứng viên → 409 REVIEW_005; review không còn PENDING/lượt đóng → 409 REVIEW_001; MEMBER không có quyền → 403; GUEST → 404", async () => {
    const s = await setup(1, 2); // owner + 1 người; An làm; cả hai được giao → không còn ai
    await expect(s.h.reassignService.reassign(s.owner, s.reviews[0].id, { reason: "Không còn ai để giao" })).rejects.toMatchObject({ statusCode: 409, errorCode: "REVIEW_005" });

    const member = userOf(s.reviews[0].reviewerId);
    await expect(s.h.reassignService.reassign(member.id === s.owner.id ? s.others[0] : member, s.reviews[0].id, { reason: "Không đủ quyền" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(s.h.reassignService.reassign(s.h.addUser("GUEST"), s.reviews[0].id, { reason: "Khách không thấy bảng" })).rejects.toMatchObject({ statusCode: 404 });

    await s.h.reviewRepo.updatePendingCas(s.reviews[0].id, 1, { status: "CANCELLED", cancelReason: "ROUND_CLOSED" });
    await expect(s.h.reassignService.reassign(s.owner, s.reviews[0].id, { toUserId: s.others[0].id, reason: "Review đã bị huỷ rồi" })).rejects.toMatchObject({ errorCode: "REVIEW_001" });
  });
});

describe("ReviewReassignService — giao lại TỰ ĐỘNG (PM2-30)", () => {
  it("người chấm rời nhóm và còn ứng viên → review cũ REASSIGNED (MEMBER_LEFT), người mới PENDING assignedBy=null, không đổi số lượt cần", async () => {
    const s = await setup(3, 2);
    const chosen = new Set(s.reviews.map((r) => r.reviewerId));
    const spare = [s.owner, ...s.others].filter((u) => !chosen.has(u.id));
    const leaver = s.reviews[0];
    leave(s.h, leaver.reviewerId);

    const out = await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, leaver.id, "MEMBER_LEFT"));

    expect(out?.replacement).not.toBeNull();
    expect(spare.map((u) => u.id)).toContain(out!.replacement!.reviewerId);
    expect(await s.h.reviewRepo.findById(leaver.id)).toMatchObject({ status: "REASSIGNED", cancelReason: "MEMBER_LEFT", replacedById: out!.replacement!.id });
    expect(out!.replacement).toMatchObject({ status: "PENDING", assignedBy: null });
    expect(await s.h.roundRepo.findById(s.round.id)).toMatchObject({ status: "OPEN", requiredReviews: 2, shortage: false });
    expect(s.h.outbox.events.map((e) => e.type)).toEqual(["review.assigned"]);
  });

  it("chạy lặp (retry consumer) là idempotent: chỉ MỘT người thay thế", async () => {
    const s = await setup(3, 2);
    const leaver = s.reviews[0];
    leave(s.h, leaver.reviewerId);
    const first = await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, leaver.id, "MEMBER_LEFT"));
    const second = await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, leaver.id, "MEMBER_LEFT"));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(s.h.store.reviews.size).toBe(3);
    expect(await s.h.reconcileService.reassignForUsers(s.h.workspaceId, [leaver.reviewerId])).toBe(0);
  });

  it("không còn ứng viên: requiredReviews giảm còn số người chấm được, shortage, outbox review.shortage; vẫn OPEN", async () => {
    const s = await setup(1, 2); // owner + 1 người (cả hai là người chấm), An là người làm
    const leaver = s.reviews[0];
    leave(s.h, leaver.reviewerId);

    const out = await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, leaver.id, "MEMBER_LEFT"));

    expect(out).toMatchObject({ replacement: null });
    expect(await s.h.reviewRepo.findById(leaver.id)).toMatchObject({ status: "CANCELLED", cancelReason: "MEMBER_LEFT" });
    const round = (await s.h.roundRepo.findById(s.round.id))!;
    expect(round).toMatchObject({ status: "OPEN", requiredReviews: 1, assignedCount: 1, shortage: true, autoApproved: false });
    expect(s.h.outbox.events.find((e) => e.type === "review.shortage")).toMatchObject({ dedupeKey: `review.shortage:round:${round.id}:v${round.version}` });
  });

  it("người còn lại đã duyệt rồi, người kia rời và không có người thay → lượt đóng APPROVED (đủ số đã duyệt), reviewState APPROVED", async () => {
    const s = await setup(1, 2);
    const [approvedOne, leaver] = s.reviews;
    await s.h.reviewRepo.updatePendingCas(approvedOne.id, 1, { status: "APPROVED", submittedAt: new Date(), score10: 9 });
    await s.h.roundRepo.updateCas(s.round.id, 1, { approvedCount: 1 });
    leave(s.h, leaver.reviewerId);

    await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, leaver.id, "MEMBER_LEFT"));

    expect(await s.h.roundRepo.findById(s.round.id)).toMatchObject({ status: "APPROVED", requiredReviews: 1, approvedCount: 1, shortage: true, autoApproved: false, closeReason: "APPROVED" });
    expect((await s.h.tasks.findById(s.task.id))!.reviewState).toBe("APPROVED");
    expect(s.h.outbox.events.map((e) => e.type).sort()).toEqual(["review.round-closed", "review.shortage"]);
  });

  it("chưa ai duyệt và không còn người chấm nào → tự duyệt (autoApproved), reviewState APPROVED, thẻ sang DONE được", async () => {
    const s = await setup(0, 2); // chỉ owner + An: owner là ứng viên duy nhất
    expect(s.reviews).toHaveLength(1);
    leave(s.h, s.owner.id);

    await s.h.runner.run(s.board.id, (tx) => s.h.reassignService.replaceReviewer(tx, s.reviews[0].id, "MEMBER_LEFT"));

    expect(await s.h.roundRepo.findById(s.round.id)).toMatchObject({ status: "APPROVED", requiredReviews: 0, autoApproved: true, shortage: true });
    expect((await s.h.tasks.findById(s.task.id))!.reviewState).toBe("APPROVED");
    expect(s.h.outbox.events.find((e) => e.type === "review.round-closed")?.payload).toMatchObject({ status: "APPROVED", autoApproved: true });
    await s.h.moveTo(s.an, s.board, s.task, "DONE");
  });

  it("người chấm được thêm vào người làm (task.assigned) → review CANCELLED/REASSIGNED (BECAME_ASSIGNEE) + người mới; đã nộp thì giữ nguyên", async () => {
    const s = await setup(3, 2);
    const [a, b] = s.reviews;
    await s.h.reviewRepo.updatePendingCas(b.id, 1, { status: "APPROVED", submittedAt: new Date(), score10: 8 });
    s.h.setTask(s.task.id, { assigneeIds: [s.an.id, a.reviewerId, b.reviewerId] });

    expect(await s.h.reconcileService.onTaskAssigned(s.task.id)).toBe(1); // chỉ `a` còn PENDING
    expect(await s.h.reviewRepo.findById(a.id)).toMatchObject({ status: "REASSIGNED", cancelReason: "BECAME_ASSIGNEE" });
    expect(await s.h.reviewRepo.findById(b.id)).toMatchObject({ status: "APPROVED" }); // đã nộp: giữ nguyên
    const replacement = [...s.h.store.reviews.values()].find((r) => r.id === (s.h.store.reviews.get(a.id) as TaskReview).replacedById)!;
    expect([s.an.id, a.reviewerId, b.reviewerId]).not.toContain(replacement.reviewerId);
    expect(await s.h.reconcileService.onTaskAssigned(s.task.id)).toBe(0); // idempotent
  });
});

describe("ReviewReconcileService — quét bù & sự kiện thẻ", () => {
  it("sweep: người chấm đã rời/ẩn danh hoá hoặc thành người làm được giao lại; lượt mở mà thẻ không còn ở REVIEW/đã xoá/bảng đã tắt bị đóng", async () => {
    const s = await setup(3, 2);
    const [a, b] = s.reviews;
    s.h.directory.inactive.add(a.reviewerId); // ẩn danh hoá
    s.h.setTask(s.task.id, { assigneeIds: [s.an.id, b.reviewerId] }); // b thành người làm

    const result = await s.h.reconcileService.sweep();
    expect(result.replaced).toBe(2);
    expect(result.cancelledRounds).toBe(0);
    expect((await s.h.reviewRepo.findById(a.id))!.cancelReason).toBe("MEMBER_LEFT");
    expect((await s.h.reviewRepo.findById(b.id))!.cancelReason).toBe("BECAME_ASSIGNEE");

    // Thẻ bị đẩy sang cột khác không qua move (đổi loại cột) → lượt mở mồ côi bị đóng.
    s.h.setTask(s.task.id, { columnKind: "TODO" });
    expect((await s.h.reconcileService.sweep()).cancelledRounds).toBe(1);
    expect(await s.h.roundRepo.findById(s.round.id)).toMatchObject({ status: "CANCELLED", closeReason: "LEFT_REVIEW" });
  });

  it("sweep: thẻ đã xoá → lượt đóng CANCELLED (TASK_DELETED); bảng tắt chấm chéo → REVIEW_DISABLED", async () => {
    const del = await setup(3, 2);
    del.h.setTask(del.task.id, { deletedAt: new Date() });
    await del.h.reconcileService.sweep();
    expect(await del.h.roundRepo.findById(del.round.id)).toMatchObject({ status: "CANCELLED", closeReason: "TASK_DELETED" });
    expect((await del.h.tasks.findById(del.task.id))!.reviewState).toBe("PENDING"); // thẻ đã xoá: giữ nguyên

    const off = await setup(3, 2);
    off.h.setBoardReview(off.board.id, { enabled: false, requiredReviews: 2, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });
    await off.h.reconcileService.sweep();
    expect(await off.h.roundRepo.findById(off.round.id)).toMatchObject({ status: "CANCELLED", closeReason: "REVIEW_DISABLED" });
    expect((await off.h.tasks.findById(off.task.id))!.reviewState).toBe("NONE");
    expect((await off.h.reviewsOf(off.round)).every((r) => r.cancelReason === "REVIEW_DISABLED")).toBe(true);
  });

  it("onTaskDeleted đóng lượt mở (TASK_DELETED) và báo người chấm; chạy lại không đổi gì", async () => {
    const s = await setup(3, 2);
    expect(await s.h.reconcileService.onTaskDeleted(s.task.id, s.board.id)).toBe(true);
    expect(await s.h.roundRepo.findById(s.round.id)).toMatchObject({ status: "CANCELLED", closeReason: "TASK_DELETED" });
    expect((s.h.outbox.events.find((e) => e.type === "review.cancelled")!.payload as { reason: string }).reason).toBe("TASK_DELETED");
    expect(await s.h.reconcileService.onTaskDeleted(s.task.id, s.board.id)).toBe(false);
  });

  it("onTaskEntered: thẻ tạo/khôi phục thẳng vào cột REVIEW của bảng bật chấm chéo → mở lượt (một lần); bảng tắt hoặc cột khác → không", async () => {
    const h = new ReviewHarness();
    const owner = h.addUser("OWNER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    const board = await h.reviewBoard(owner, { requiredReviews: 1 });
    const t = await h.addTask(owner, board, "Tạo thẳng vào REVIEW", { columnId: h.columnId(board, "REVIEW") });
    expect(await h.roundRepo.findOpen(t.id)).toBeNull(); // tạo thẻ không đi qua `move` ⇒ chưa có lượt

    expect(await h.reconcileService.onTaskEntered(t.id)).toBe(true);
    expect(await h.reconcileService.onTaskEntered(t.id)).toBe(false); // idempotent
    expect(h.store.rounds.size).toBe(1);
    expect((await h.tasks.findById(t.id))!.reviewState).toBe("PENDING");

    const todo = await h.addTask(owner, board, "Ở TODO");
    expect(await h.reconcileService.onTaskEntered(todo.id)).toBe(false);
  });
});
