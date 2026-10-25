import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const messageIdParamSchema = z.object({ messageId: objectIdSchema });
export const channelIdParamSchema = z.object({ channelId: objectIdSchema });

/**
 * `POST /messages/:messageId/announcement` — `deadlineAt` tuỳ chọn: tương lai và tối đa `deadlineMaxDays` ngày. Ràng buộc theo
 * "bây giờ" do SERVICE kiểm (schema không biết thời điểm request) để trả `VAL_001` kèm giới hạn rõ ràng.
 */
export const createAnnouncementSchema = z.object({
  deadlineAt: z.coerce.date().optional(),
});
export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;

export const receiptsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["confirmed", "pending"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(LIMITS.announcement.receiptsPageMax).default(LIMITS.pagination.default),
});
export type ReceiptsQueryDto = z.infer<typeof receiptsQuerySchema>;
