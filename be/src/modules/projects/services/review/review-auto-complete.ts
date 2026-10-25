import type { Board } from "../../entities/board.interface";
import type { Task } from "../../entities/task.interface";
import type { TxContext } from "../../repositories/unit-of-work";
import type { MoveOutcome, TaskMoveService } from "../task-move.service";
import { parseBoardReview } from "./review-config.schema";
import type { ReviewDeps } from "./review.deps";

export interface IReviewAutoComplete {
  /** `null` = không có gì để làm (tuỳ chọn tắt, thẻ không còn ở REVIEW/đã DONE, bảng không có cột DONE). */
  complete(tx: TxContext, p: { task: Pick<Task, "id">; board: Board }): Promise<MoveOutcome | null>;
}

/**
 * P1 `autoCompleteOnApproval` (p4-05 be.md §5.3 bước 5): lượt chấm vừa đóng `APPROVED` mà bảng bật tuỳ chọn ⇒ HỆ THỐNG chuyển thẻ sang cột DONE.
 * Đi đúng đường `move` (`TaskMoveService.moveAsSystem`): CAS `version`, `ReviewDonePolicy` (lượt vừa `APPROVED` cùng transaction nên qua), effect,
 * activity `MOVED` (actor `null`), outbox `task.completed` kèm `review { approved: true }`. Chạy TRONG transaction của caller (nộp chấm / giao lại):
 * duyệt và hoàn thành cùng commit, lỗi ⇒ rollback cả hai — không có thẻ "đã duyệt" mà kẹt giữa chừng.
 *
 * Idempotent: thẻ đã DONE / không còn ở REVIEW / đã xoá ⇒ `null`, không ghi gì. Không áp cho lượt tự duyệt do không có ứng viên (chưa ai duyệt thật)
 * và cho miễn chấm (quyết định thủ công của OWNER/ADMIN — người đó tự kéo Done).
 */
export class ReviewAutoComplete implements IReviewAutoComplete {
  constructor(
    private readonly d: Pick<ReviewDeps, "tasks">,
    private readonly moves: Pick<TaskMoveService, "moveAsSystem">
  ) {}

  async complete(tx: TxContext, p: { task: Pick<Task, "id">; board: Board }): Promise<MoveOutcome | null> {
    const config = parseBoardReview(p.board.review);
    if (!config.enabled || !config.autoCompleteOnApproval) return null;
    const done = [...p.board.columns].sort((a, b) => a.order - b.order).find((c) => c.kind === "DONE");
    if (!done) return null;
    // Đọc lại TRONG transaction: `version` mới nhất (nộp chấm không đổi `version`, nhưng đường khác có thể).
    const task = await this.d.tasks.findById(p.task.id, tx);
    if (!task || task.deletedAt || task.columnKind !== "REVIEW") return null;
    return this.moves.moveAsSystem(tx, task.id, { columnId: done.id, expectedVersion: task.version });
  }
}
