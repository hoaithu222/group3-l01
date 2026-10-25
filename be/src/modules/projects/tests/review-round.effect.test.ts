import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board } from "../entities/board.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import type { Task } from "../entities/task.interface";
import { ReviewHarness } from "./support/review-harness";

const catchError = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("Đáng lẽ phải lỗi");
};

describe("TaskMoveEffect + ReviewDonePolicy trong move (PM2-05, PM2-06)", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let binh: AuthUser;
  let chi: AuthUser;
  let dung: AuthUser;
  let em: AuthUser;
  let board: Board;

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    binh = h.addUser("MEMBER");
    chi = h.addUser("MEMBER");
    dung = h.addUser("MEMBER");
    em = h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2 });
  });

  const taskOf = async (title: string, assignees: AuthUser[] = [an]): Promise<Task> => {
    const t = await h.addTask(owner, board, title);
    h.setTask(t.id, { assigneeIds: assignees.map((u) => u.id) });
    return (await h.tasks.findById(t.id)) as Task;
  };

  /** Dựng tải: `n` review PENDING của người này ở các thẻ khác trong CÙNG workspace. */
  const seedLoad = async (user: AuthUser, n: number): Promise<void> => {
    await h.reviewRepo.createMany(
      Array.from({ length: n }, () => ({ roundId: newObjectId(), taskId: newObjectId(), boardId: board.id, workspaceId: h.workspaceId, reviewerId: user.id, assignedBy: null, assignedAt: new Date("2026-09-20T00:00:00Z") }))
    );
  };

  it("PM2-05: thẻ của An vào REVIEW, requiredReviews=2; Bình 3 lượt, Chi 0, Dũng 1, Em 0 → giao Chi và Em (không An), reviewState PENDING", async () => {
    await seedLoad(binh, 3);
    await seedLoad(dung, 1);
    await seedLoad(owner, 6); // chủ nhóm (người thứ 6 của harness) đang rất bận — nhóm "5 người" của kịch bản chỉ gồm An, Bình, Chi, Dũng, Em
    const t = await taskOf("Làm màn hình đăng nhập");

    const moved = await h.moveTo(an, board, t, "REVIEW");
    expect(moved.columnKind).toBe("REVIEW");
    expect(moved.reviewState).toBe("PENDING");

    const round = (await h.currentRound(t.id))!;
    expect(round).toMatchObject({ round: 1, status: "OPEN", requiredReviews: 2, configuredReviews: 2, assignedCount: 2, approvedCount: 0, shortage: false, autoApproved: false, activeKey: `task:${t.id}` });
    const reviews = await h.reviewsOf(round);
    expect(reviews.map((r) => r.reviewerId).sort()).toEqual([chi.id, em.id].sort());
    expect(reviews.every((r) => r.status === "PENDING" && r.assignedBy === null)).toBe(true);
    expect(reviews.map((r) => r.reviewerId)).not.toContain(an.id);

    const assigned = h.outbox.events.find((e) => e.type === "review.assigned")!;
    expect(assigned).toMatchObject({ queue: "notifications", jobName: "review.events", dedupeKey: `review.assigned:round:${round.id}` });
    expect((assigned.payload as { reviews: { reviewerId: string }[] }).reviews.map((r) => r.reviewerId).sort()).toEqual([chi.id, em.id].sort());
    expect(h.activities.activities.find((a) => a.type === "REVIEW_REQUESTED")).toMatchObject({ actorId: null, after: { roundId: round.id, round: 1 } });
  });

  it("bảng chưa bật chấm chéo: vào REVIEW không mở lượt, sang DONE không bị chặn, task.completed.review = { enabled:false, approved:false }", async () => {
    const off = await h.reviewBoard(owner, { enabled: false });
    const t = await h.addTask(owner, off, "Không chấm");
    h.setTask(t.id, { assigneeIds: [an.id] });
    await h.moveTo(an, off, t, "REVIEW");
    expect(await h.currentRound(t.id)).toBeNull();
    await h.moveTo(an, off, t, "DONE");
    const completed = h.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(completed.review).toEqual({ enabled: false, approved: false });
  });

  it("PM2-06: chưa đủ duyệt thì KHÔNG sang DONE được — cả từ REVIEW (1/2) lẫn nhảy thẳng TODO → DONE; thẻ giữ nguyên, không outbox task.completed", async () => {
    const t = await taskOf("Chặn done");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    // Một người duyệt (1/2).
    const first = (await h.reviewsOf(round))[0];
    await h.roundRepo.updateCas(round.id, round.version, { approvedCount: 1 });
    await h.reviewRepo.updatePendingCas(first.id, first.version, { status: "APPROVED", submittedAt: new Date(), score10: 8 });

    const err1 = await catchError(h.moveTo(an, board, t, "DONE"));
    expect(err1).toMatchObject({ statusCode: 409, errorCode: "TASK_002", details: { reason: "REVIEW_REQUIRED", approvedCount: 1, requiredReviews: 2, roundStatus: "OPEN" } });
    expect(await h.tasks.findById(t.id)).toMatchObject({ columnKind: "REVIEW", completedAt: null });

    const fresh = await taskOf("Nhảy thẳng");
    const err2 = await catchError(h.moveTo(an, board, fresh, "DONE"));
    expect(err2).toMatchObject({ errorCode: "TASK_002", details: { reason: "REVIEW_REQUIRED", roundStatus: "NONE" } });
    expect(h.outbox.events.filter((e) => e.type === "task.completed")).toHaveLength(0);
  });

  it("đủ duyệt (reviewState APPROVED + lượt APPROVED) → sang DONE, task.completed mang review { enabled, approved, roundId }", async () => {
    const t = await taskOf("Đủ duyệt");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    const closed = (await h.roundRepo.updateCas(round.id, round.version, { status: "APPROVED", approvedCount: 2, closedAt: new Date(), closeReason: "APPROVED" }))!;
    await h.tasks.setReviewState(t.id, "APPROVED");

    await h.moveTo(an, board, t, "DONE");
    const completed = h.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(completed.review).toMatchObject({ enabled: true, approved: true, roundId: closed.id, autoApproved: false, waived: false });
  });

  it("rời REVIEW sang cột khác DONE khi lượt OPEN → lượt CANCELLED (LEFT_REVIEW), review chờ CANCELLED, reviewState NONE, outbox review.cancelled; huỷ activeKey", async () => {
    const t = await taskOf("Rút lại");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;

    const back = await h.moveTo(an, board, t, "IN_PROGRESS");
    expect(back.reviewState).toBe("NONE");
    const closed = (await h.roundRepo.findById(round.id))!;
    expect(closed).toMatchObject({ status: "CANCELLED", closeReason: "LEFT_REVIEW", activeKey: `round:${round.id}` });
    expect((await h.reviewsOf(round)).every((r) => r.status === "CANCELLED" && r.cancelReason === "ROUND_CLOSED")).toBe(true);
    const cancelled = h.outbox.events.find((e) => e.type === "review.cancelled")!;
    expect(cancelled).toMatchObject({ dedupeKey: `review.cancelled:round:${round.id}` });
    expect((cancelled.payload as { reason: string }).reason).toBe("LEFT_REVIEW");
    expect(await h.roundRepo.findOpen(t.id)).toBeNull();
  });

  it("kéo lại vào REVIEW → lượt 2, người chấm ở vòng trước được ưu tiên dù đang bận hơn (PM2-29)", async () => {
    const t = await taskOf("Vòng hai");
    await h.moveTo(an, board, t, "REVIEW");
    const r1 = (await h.currentRound(t.id))!;
    const firstReviewers = (await h.reviewsOf(r1)).map((r) => r.reviewerId).sort();
    await h.moveTo(an, board, t, "TODO");
    // Người vòng 1 nhận thêm việc → tải cao hơn; người khác rảnh.
    const everyone = [owner, binh, chi, dung, em];
    for (const id of firstReviewers) await seedLoad(everyone.find((u) => u.id === id)!, 4);

    await h.moveTo(an, board, t, "REVIEW");
    const r2 = (await h.currentRound(t.id))!;
    expect(r2.round).toBe(2);
    expect((await h.reviewsOf(r2)).map((r) => r.reviewerId).sort()).toEqual(firstReviewers);
  });

  it("thiếu người: nhóm chỉ còn 1 ứng viên (ngoài người làm) với requiredReviews=2 → requiredReviews thực = 1, shortage, outbox review.shortage", async () => {
    const small = new ReviewHarness();
    const o = small.addUser("OWNER");
    const a = small.addUser("MEMBER");
    const bd = await small.reviewBoard(o, { requiredReviews: 2 });
    const t = await small.addTask(o, bd, "Nhóm nhỏ");
    small.setTask(t.id, { assigneeIds: [a.id] });

    await small.moveTo(a, bd, t, "REVIEW");
    const round = (await small.currentRound(t.id))!;
    expect(round).toMatchObject({ status: "OPEN", requiredReviews: 1, configuredReviews: 2, shortage: true, autoApproved: false });
    expect((await small.reviewsOf(round)).map((r) => r.reviewerId)).toEqual([o.id]);
    expect(small.outbox.events.find((e) => e.type === "review.shortage")).toMatchObject({ dedupeKey: `review.shortage:round:${round.id}:v1` });
  });

  it("không có ứng viên nào (chỉ người làm trong nhóm) → lượt APPROVED tự động (autoApproved), reviewState APPROVED, thẻ sang DONE được, outbox review.round-closed", async () => {
    const solo = new ReviewHarness();
    const o = solo.addUser("OWNER");
    const bd = await solo.reviewBoard(o, { requiredReviews: 2 });
    const t = await solo.addTask(o, bd, "Một mình");
    solo.setTask(t.id, { assigneeIds: [o.id] });

    const moved = await solo.moveTo(o, bd, t, "REVIEW");
    expect(moved.reviewState).toBe("APPROVED");
    const round = (await solo.currentRound(t.id))!;
    expect(round).toMatchObject({ status: "APPROVED", requiredReviews: 0, autoApproved: true, shortage: true, closeReason: "APPROVED", activeKey: `round:${round.id}` });
    expect(await solo.reviewsOf(round)).toHaveLength(0);
    expect(solo.outbox.events.find((e) => e.type === "review.round-closed")?.payload).toMatchObject({ status: "APPROVED", autoApproved: true, assigneeIds: [o.id] });

    await solo.moveTo(o, bd, t, "DONE");
    const completed = solo.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(completed.review).toMatchObject({ enabled: true, approved: true, autoApproved: true });
  });

  it("nhóm người chấm giới hạn (reviewerPool): chỉ chọn trong nhóm, kể cả khi người ngoài nhóm rảnh hơn", async () => {
    h.setBoardReview(board.id, { enabled: true, requiredReviews: 2, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false, reviewerPool: [binh.id, dung.id] });
    await seedLoad(binh, 5);
    const t = await taskOf("Có pool");
    await h.moveTo(an, board, t, "REVIEW");
    expect((await h.reviewsOf((await h.currentRound(t.id))!)).map((r) => r.reviewerId).sort()).toEqual([binh.id, dung.id].sort());
  });

  it("GUEST và tài khoản không còn hoạt động không bao giờ được chọn", async () => {
    const guest = h.addUser("GUEST");
    h.directory.inactive.add(em.id);
    await seedLoad(binh, 9);
    await seedLoad(chi, 9);
    await seedLoad(dung, 9);
    const t = await taskOf("Lọc ứng viên");
    await h.moveTo(an, board, t, "REVIEW");
    const chosen = (await h.reviewsOf((await h.currentRound(t.id))!)).map((r) => r.reviewerId);
    expect(chosen).not.toContain(guest.id);
    expect(chosen).not.toContain(em.id);
    expect(chosen).not.toContain(an.id);
    expect(chosen.every((id) => [binh.id, chi.id, dung.id, owner.id].includes(id))).toBe(true);
  });

  it("mở lại thẻ khỏi DONE: trong ân hạn giữ duyệt, quá hạn → reviewState NONE (cần lượt mới); DONE → REVIEW mở lượt mới", async () => {
    const t = await taskOf("Mở lại");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    await h.roundRepo.updateCas(round.id, round.version, { status: "APPROVED", approvedCount: 2, closedAt: new Date(), closeReason: "APPROVED" });
    await h.tasks.setReviewState(t.id, "APPROVED");
    await h.moveTo(an, board, t, "DONE");

    // Trong ân hạn (vừa hoàn thành) → về TODO vẫn còn duyệt, kéo lại DONE không bị chặn.
    expect((await h.moveTo(an, board, t, "TODO")).reviewState).toBe("APPROVED");
    await h.moveTo(an, board, t, "DONE");

    // Quá ân hạn: đẩy completedAt về 11 phút trước rồi mở lại.
    h.setTask(t.id, { completedAt: new Date(Date.now() - 11 * 60_000) });
    expect((await h.moveTo(an, board, t, "TODO")).reviewState).toBe("NONE");
    await expect(h.moveTo(an, board, t, "DONE")).rejects.toMatchObject({ errorCode: "TASK_002" });

    // DONE → REVIEW: lượt mới (round 2).
    h.setTask(t.id, { columnId: h.columnId(board, "DONE"), columnKind: "DONE", completedAt: new Date(), completionCount: 3, reviewState: "APPROVED" });
    await h.moveTo(an, board, t, "REVIEW");
    expect((await h.currentRound(t.id))!.round).toBe(2);
  });

  it("thẻ đã được duyệt mà bị kéo ra khỏi REVIEW về IN_PROGRESS thì mất duyệt", async () => {
    const t = await taskOf("Sửa thêm");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    await h.roundRepo.updateCas(round.id, round.version, { status: "APPROVED", approvedCount: 2, closedAt: new Date(), closeReason: "APPROVED" });
    await h.tasks.setReviewState(t.id, "APPROVED");
    expect((await h.moveTo(an, board, t, "IN_PROGRESS")).reviewState).toBe("NONE");
    await expect(h.moveTo(an, board, t, "DONE")).rejects.toMatchObject({ errorCode: "TASK_002" });
  });

  it("chạy hiệu ứng lặp (thẻ đã có lượt OPEN) là idempotent: không tạo lượt/review thứ hai", async () => {
    const t = await taskOf("Idempotent");
    await h.moveTo(an, board, t, "REVIEW");
    const round = (await h.currentRound(t.id))!;
    const after = (await h.tasks.findById(t.id)) as Task;
    const again = await h.roundService.openRound({ __projectsTx: true }, { task: after, board: (await h.boards.findById(board.id)) as Board, config: { enabled: true, requiredReviews: 2, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false }, openedBy: null, now: new Date() });
    expect(again.created).toBe(false);
    expect(again.round.id).toBe(round.id);
    expect(h.store.rounds.size).toBe(1);
    expect(h.store.reviews.size).toBe(2);
  });
});
