import type { AuthUser } from "../../../core/types/express";
import type { Board, ColumnKindValue } from "../entities/board.interface";
import { ReviewHarness } from "./support/review-harness";

/**
 * p3-02/p4-05 — `PUT /boards/:id/columns` đổi `kind` cột CÓ thẻ sang/khỏi REVIEW phải mở/đóng lượt chấm:
 * `BoardService.putColumns` ghi outbox `review.backfill { mode: SYNC }` cùng transaction, job `ReviewBackfillService` (mode SYNC) làm phần còn lại.
 */
describe("putColumns — đổi kind cột sang/khỏi REVIEW", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let worker: AuthUser;
  let board: Board;

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    worker = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 1 }); // To do / In progress / Review / Done, chấm chéo BẬT
  });

  /** Đổi `kind` của cột `from` thành `to` bằng đúng `PUT columns` (giữ id/tên/thứ tự). */
  async function changeKind(from: ColumnKindValue, to: ColumnKindValue): Promise<Board> {
    const cur = (await h.boards.findById(board.id)) as Board;
    const columns = cur.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind === from ? to : c.kind, wipLimit: c.wipLimit }));
    await h.boardService.putColumns(owner, board.id, { columns, expectedVersion: cur.version });
    return (await h.boards.findById(board.id)) as Board;
  }
  const syncRows = () => h.outbox.events.filter((e) => e.type === "review.backfill");
  const runSync = async (b: Board) => h.backfillService.run({ boardId: b.id, version: b.version, mode: "SYNC" });

  it("cột có thẻ đổi SANG REVIEW: ghi 1 dòng outbox SYNC (dedupe theo version); job mở lượt cho thẻ trong cột, chạy lại không mở thêm", async () => {
    const t = await h.addTask(owner, board, "Đang làm", { columnId: h.columnId(board, "IN_PROGRESS") });
    h.setTask(t.id, { assigneeIds: [worker.id] });

    const after = await changeKind("IN_PROGRESS", "REVIEW");
    expect(syncRows()).toEqual([
      expect.objectContaining({ queue: "reports", jobName: "review.backfill", dedupeKey: `review.backfill:board:${board.id}:v${after.version}`, payload: { boardId: board.id, version: after.version, mode: "SYNC" } }),
    ]);
    expect((await h.tasks.findById(t.id))!.columnKind).toBe("REVIEW");
    expect(await h.roundRepo.findOpen(t.id)).toBeNull(); // chưa có lượt cho tới khi job chạy

    expect(await runSync(after)).toEqual({ opened: 1, cancelled: 0 });
    expect(await h.roundRepo.findOpen(t.id)).not.toBeNull();
    expect((await h.tasks.findById(t.id))!.reviewState).toBe("PENDING");
    expect(await runSync(after)).toEqual({ opened: 0, cancelled: 0 }); // idempotent
  });

  it("cột có thẻ đổi KHỎI REVIEW: job đóng lượt LEFT_REVIEW (review chờ huỷ, reviewState NONE, outbox review.cancelled); thẻ đã duyệt còn sót ở TODO/IN_PROGRESS mất duyệt", async () => {
    const pending = await h.addTask(owner, board, "Chờ duyệt");
    h.setTask(pending.id, { assigneeIds: [worker.id] });
    await h.moveTo(worker, board, pending, "REVIEW");
    const approved = await h.addTask(owner, board, "Đã duyệt", { columnId: h.columnId(board, "REVIEW") });
    h.setTask(approved.id, { reviewState: "APPROVED" });
    h.outbox.events.length = 0;

    const after = await changeKind("REVIEW", "IN_PROGRESS");
    expect(syncRows()).toHaveLength(1);
    expect(await h.roundRepo.findOpen(pending.id)).not.toBeNull(); // trước khi job chạy vẫn còn lượt

    expect(await runSync(after)).toEqual({ opened: 0, cancelled: 2 });
    expect(await h.roundRepo.findOpen(pending.id)).toBeNull();
    expect([...h.store.rounds.values()].every((r) => r.status === "CANCELLED" && r.closeReason === "LEFT_REVIEW")).toBe(true);
    expect((await h.tasks.findById(pending.id))!.reviewState).toBe("NONE");
    expect((await h.tasks.findById(approved.id))!.reviewState).toBe("NONE");
    expect(h.outbox.events.filter((e) => e.type === "review.cancelled")).toHaveLength(1);
    expect(await runSync(after)).toEqual({ opened: 0, cancelled: 0 }); // idempotent
  });

  it("bảng TẮT chấm chéo: SYNC KHÔNG mở lượt cho thẻ vừa vào cột REVIEW", async () => {
    const t = await h.addTask(owner, board, "Đang làm", { columnId: h.columnId(board, "IN_PROGRESS") });
    h.setTask(t.id, { assigneeIds: [worker.id] });
    h.setBoardReview(board.id, { enabled: false, requiredReviews: 1, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });

    const after = await changeKind("IN_PROGRESS", "REVIEW");
    expect(await runSync(after)).toEqual({ opened: 0, cancelled: 0 });
    expect(await h.roundRepo.findOpen(t.id)).toBeNull();
    expect((await h.tasks.findById(t.id))!.reviewState).toBe("NONE");
  });

  it("bảng TẮT chấm chéo nhưng còn lượt cũ sót: SYNC vẫn đóng lượt của thẻ rời REVIEW", async () => {
    const t = await h.addTask(owner, board, "Trong REVIEW");
    h.setTask(t.id, { assigneeIds: [worker.id] });
    await h.moveTo(worker, board, t, "REVIEW"); // mở lượt khi còn BẬT
    expect(await h.roundRepo.findOpen(t.id)).not.toBeNull();
    h.setBoardReview(board.id, { enabled: false, requiredReviews: 1, rubric: [], preventSelfReview: true, autoCompleteOnApproval: false });

    const after = await changeKind("REVIEW", "TODO");
    expect(await runSync(after)).toEqual({ opened: 0, cancelled: 1 });
    expect(await h.roundRepo.findOpen(t.id)).toBeNull();
  });

  it("KHÔNG ghi outbox khi: đổi kind cột KHÔNG liên quan REVIEW, cột rỗng đổi sang REVIEW, hoặc chỉ đổi tên/thứ tự", async () => {
    await h.addTask(owner, board, "Ở TODO"); // cột TODO có thẻ
    await changeKind("TODO", "IN_PROGRESS"); // TODO → IN_PROGRESS: không liên quan REVIEW
    expect(syncRows()).toHaveLength(0);
    await changeKind("IN_PROGRESS", "TODO"); // trả lại
    await changeKind("REVIEW", "IN_PROGRESS"); // cột REVIEW RỖNG
    expect(syncRows()).toHaveLength(0);
    const cur = (await h.boards.findById(board.id)) as Board;
    await h.boardService.putColumns(owner, board.id, { columns: cur.columns.map((c) => ({ id: c.id, title: `${c.title} *`, kind: c.kind, wipLimit: c.wipLimit })), expectedVersion: cur.version });
    expect(syncRows()).toHaveLength(0);
  });

  it("đổi DONE ↔ khác trên cột có thẻ vẫn bị chặn TASK_008 (không ghi outbox)", async () => {
    // Tạo thẳng vào DONE bị chính sách chấm chéo chặn (TASK_002) — dựng thẻ đã hoàn thành trực tiếp trong kho.
    const done = await h.addTask(owner, board, "Xong");
    h.setTask(done.id, { columnId: h.columnId(board, "DONE"), columnKind: "DONE", completedAt: new Date(), completionCount: 1 });
    await expect(changeKind("DONE", "REVIEW")).rejects.toMatchObject({ errorCode: "TASK_008" });
    expect(syncRows()).toHaveLength(0);
  });
});
