import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { BOARD_COLUMN_ID_REGEX } from "../../../core/constants/project";

const columnIdSchema = z.string().regex(BOARD_COLUMN_ID_REGEX, "Mã cột không hợp lệ");
const clientKey = z.string().min(8).max(64);

/**
 * `POST /tasks/:id/duplicate` (p3-03 P1) — sao chép thẻ. Mặc định: giữ nhãn, mô tả, ngày, điểm và checklist (bỏ dấu tick); KHÔNG sao chép người làm
 * (`keepAssignees`), tệp đính kèm, bình luận, nhật ký, phụ thuộc, trạng thái chấm. `title` vắng ⇒ "<tiêu đề gốc> (bản sao)".
 * `columnId` vắng ⇒ cột của thẻ gốc nếu là TODO/IN_PROGRESS, còn lại (REVIEW/DONE) ⇒ cột TODO đầu tiên.
 */
export const duplicateTaskSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(LIMITS.task.titleMax).optional(),
  columnId: columnIdSchema.optional(),
  keepAssignees: z.boolean().default(false),
  keepChecklist: z.boolean().default(true),
  clientTaskId: clientKey.optional(),
  clientMutationId: clientKey.optional(),
});

/** `POST /tasks/:id/checklist/:itemId/convert` (p3-03 P1) — thân tuỳ chọn; `columnId` vắng ⇒ cột TODO đầu tiên của bảng. */
export const convertChecklistItemSchema = z.object({
  columnId: columnIdSchema.optional(),
  clientMutationId: clientKey.optional(),
});

export type DuplicateTaskDto = z.infer<typeof duplicateTaskSchema>;
export type ConvertChecklistItemDto = z.infer<typeof convertChecklistItemSchema>;
