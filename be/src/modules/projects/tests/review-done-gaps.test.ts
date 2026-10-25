import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import { defaultBoardReview } from "../services/review/review-config.schema";
import { ReviewHarness } from "./support/review-harness";

/**
 * Đóng hở p4-05 (be.md §12 "Điểm còn hở"): thẻ vào DONE KHÔNG qua `move` vẫn phải qua `ReviewDonePolicy`. README §2: "thẻ không thể sang Done khi
 * chưa đủ lượt duyệt — kể cả khi gọi API trực tiếp" ⇒ CHẶN (`409 TASK_002 { reason: "REVIEW_REQUIRED" }`), cùng payload với `move`. Hai đường:
 *  · tạo thẳng vào cột DONE;
 *  · khôi phục từ thùng rác về cột DONE khi thẻ CHƯA hoàn thành lúc xoá (cột đổi loại DONE trong lúc thẻ nằm thùng rác — `putColumns` chỉ chặn
 *    đổi loại khi cột còn thẻ CHƯA xoá). Đổi loại cột có thẻ sống sang DONE đã bị `TASK_008` chặn từ p3-02.
 */
describe("Chấm chéo — đóng hở vào DONE không qua move", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;

  const doneCol = (): string => h.columnId(board, "DONE");
  const rows = (type: string) => h.outbox.events.filter((e) => e.type === type);
  const REQUIRED = { statusCode: 409, errorCode: "TASK_002", details: { reason: "REVIEW_REQUIRED", approvedCount: 0, requiredReviews: 2, roundStatus: "NONE" } };

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    h.addUser("MEMBER");
    h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2 });
  });

  describe("tạo thẳng vào cột DONE", () => {
    it("bảng bật chấm chéo → 409 TASK_002 REVIEW_REQUIRED (như move), không có sự kiện tạo/hoàn thành nào được ghi", async () => {
      await expect(h.addTask(an, board, "Lách luật", { columnId: doneCol() })).rejects.toMatchObject(REQUIRED);
      expect(rows("task.created")).toHaveLength(0);
      expect(rows("task.completed")).toHaveLength(0);
      expect(h.emitter.of("task:created")).toHaveLength(0);
    });

    it("bảng tắt chấm chéo → tạo được như trước; task.completed mang review { enabled: false, approved: false }", async () => {
      h.setBoardReview(board.id, defaultBoardReview(2, false));
      const t = await h.addTask(an, board, "Đã xong sẵn", { columnId: doneCol() });
      expect(t).toMatchObject({ columnKind: "DONE", completionCount: 1 });
      expect(t.completedAt).not.toBeNull();
      const payload = rows("task.completed")[0].payload as unknown as TaskCompletedPayload;
      expect(payload.review).toEqual({ enabled: false, approved: false });
    });

    it("tạo vào cột khác (TODO/REVIEW…) không bị ảnh hưởng", async () => {
      const t = await h.addTask(an, board, "Việc mới");
      expect(t.columnKind).toBe("TODO");
      expect(rows("task.completed")).toHaveLength(0);
    });
  });

  describe("khôi phục từ thùng rác", () => {
    /** Thẻ ở cột TODO bị xoá; sau đó hai cột đổi loại (TODO ↔ DONE) — cột nào cũng RỖNG thẻ sống nên `putColumns` cho phép. */
    async function trashThenSwapDone(): Promise<Task> {
      const t = await h.addTask(an, board, "Thẻ trong thùng rác");
      await h.detailService.remove(an, t.id);
      const b = (await h.boards.findById(board.id)) as Board;
      const columns = b.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind === "TODO" ? ("DONE" as const) : c.kind === "DONE" ? ("TODO" as const) : c.kind }));
      await h.boardService.putColumns(owner, board.id, { columns, expectedVersion: b.version });
      board = (await h.boards.findById(board.id)) as Board;
      return (await h.tasks.findById(t.id)) as Task;
    }

    it("về cột đã thành DONE mà thẻ chưa hoàn thành lúc xoá → 409 TASK_002 REVIEW_REQUIRED; thẻ vẫn ở thùng rác, không hoàn thành", async () => {
      const trashed = await trashThenSwapDone();
      expect(trashed.deletedAt).not.toBeNull();
      h.outbox.events.length = 0;

      await expect(h.detailService.restore(an, trashed.id)).rejects.toMatchObject(REQUIRED);

      const after = (await h.tasks.findById(trashed.id)) as Task;
      expect(after.deletedAt).not.toBeNull();
      expect(after.completedAt).toBeNull();
      expect(rows("task.completed")).toHaveLength(0);
      expect(rows("task.restored")).toHaveLength(0);
    });

    it("cùng tình huống nhưng bảng tắt chấm chéo → khôi phục được và hoàn thành đúng MỘT lần (review { enabled: false })", async () => {
      const trashed = await trashThenSwapDone();
      h.setBoardReview(board.id, defaultBoardReview(2, false));
      h.outbox.events.length = 0;

      await h.detailService.restore(an, trashed.id);

      const after = (await h.tasks.findById(trashed.id)) as Task;
      expect(after).toMatchObject({ deletedAt: null, columnKind: "DONE", completionCount: 1 });
      expect(rows("task.completed")).toHaveLength(1);
      expect((rows("task.completed")[0].payload as unknown as TaskCompletedPayload).review).toEqual({ enabled: false, approved: false });
    });

    it("thẻ vốn ĐÃ hoàn thành khi xoá → khôi phục lại DONE bình thường (không phải hoàn thành mới ⇒ không kiểm, không task.completed)", async () => {
      h.setBoardReview(board.id, defaultBoardReview(2, false));
      const t = await h.addTask(an, board, "Xong rồi", { columnId: doneCol() });
      h.setBoardReview(board.id, defaultBoardReview(2, true)); // bật chấm chéo SAU khi thẻ đã xong
      await h.detailService.remove(an, t.id);
      h.outbox.events.length = 0;

      await h.detailService.restore(an, t.id);

      expect(await h.tasks.findById(t.id)).toMatchObject({ deletedAt: null, columnKind: "DONE", completionCount: 1 });
      expect(rows("task.completed")).toHaveLength(0);
      expect(rows("task.restored")).toHaveLength(1);
    });

    it("khôi phục về cột không phải DONE không bị ảnh hưởng (bảng bật chấm chéo)", async () => {
      const t = await h.addTask(an, board, "Thẻ thường");
      await h.detailService.remove(an, t.id);
      await h.detailService.restore(an, t.id);
      expect(await h.tasks.findById(t.id)).toMatchObject({ deletedAt: null, columnKind: "TODO" });
    });
  });

  it("đổi loại cột CÓ thẻ sống sang DONE vẫn bị chặn TASK_008 (hở này đã đóng từ p3-02)", async () => {
    await h.addTask(an, board, "Thẻ sống ở TODO");
    const b = (await h.boards.findById(board.id)) as Board;
    const columns = b.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind === "TODO" ? ("DONE" as const) : c.kind === "DONE" ? ("TODO" as const) : c.kind }));
    await expect(h.boardService.putColumns(owner, board.id, { columns, expectedVersion: b.version })).rejects.toMatchObject({ errorCode: "TASK_008" });
  });
});
