import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Task } from "../entities/task.interface";
import type { RescheduleService } from "./reschedule.service";

/** Cổng chặn PATCH lùi hạn (p4-04 be.md §5.5) — `TaskDetailService.patch` gọi TRƯỚC khi ghi. */
export interface IReschedulePolicy {
  /** Ném `409 TASK_006 { preview }` khi đổi hạn của `before` sang `patch.dueDate` sẽ dời lịch các thẻ sau. Không ghi gì. */
  assertPatchAllowed(before: Task, patch: { dueDate?: Date | null; startDate?: Date | null }): Promise<void>;
}

/**
 * Chỉ chặn khi: có hạn mới MUỘN hơn hạn cũ, thẻ còn chặn thẻ khác (`blockingCount > 0`), thẻ chưa DONE (thẻ đã xong không còn
 * ràng buộc thời gian với thẻ sau) và bản xem trước có ≥ 1 thẻ bị ảnh hưởng. Rút ngắn/xoá hạn, chỉ đổi `startDate`, hoặc không thẻ
 * nào bị ảnh hưởng → PATCH chạy như cũ (KHÔNG tự dời — dời lịch luôn là lệnh tường minh `POST /tasks/:id/reschedule`).
 */
export class ReschedulePolicy implements IReschedulePolicy {
  constructor(private readonly reschedule: Pick<RescheduleService, "previewFor">) {}

  async assertPatchAllowed(before: Task, patch: { dueDate?: Date | null; startDate?: Date | null }): Promise<void> {
    const due = patch.dueDate;
    if (!due || !before.dueDate || due.getTime() <= before.dueDate.getTime()) return;
    if (before.columnKind === "DONE" || (before.blockingCount ?? 0) <= 0) return;

    const preview = await this.reschedule.previewFor(before, { dueDate: due, startDate: patch.startDate });
    if (preview.affectedCount > 0) throw new AppError(ErrorMessages[ErrorCode.TASK_006], 409, ErrorCode.TASK_006, { preview });
  }
}
