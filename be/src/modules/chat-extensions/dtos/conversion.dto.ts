import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * Chuyển tin thành thẻ công việc. `includeQuote` chỉ có tác dụng khi bảng cùng nhóm với tin và tin không phải 1-1 (xem `MessageConversionService`); tệp đính kèm KHÔNG tự sao chép.
 * Header `Idempotency-Key` bắt buộc ở route (bấm hai lần không sinh hai thẻ).
 */
export const toTaskSchema = z
  .object({
    boardId: objectIdSchema,
    columnId: z.string().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(LIMITS.task.titleMax),
    assigneeIds: z.array(objectIdSchema).max(10).default([]),
    dueDate: z.coerce.date().optional(),
    includeQuote: z.boolean().default(true),
  })
  .strict();
export type ToTaskDto = z.infer<typeof toTaskSchema>;

/**
 * Lưu tệp của tin vào Resource Hub. `assetIds` PHẢI là tệp đính kèm của chính tin đó. `confirmVisibilityExpansion` bắt buộc `true` khi nguồn là hội thoại/kênh riêng tư (tệp sẽ hiện cho
 * MỌI thành viên nhóm đích) — thiếu → 400 `VAL_001` `details.requiresConfirmation`.
 */
export const toResourceSchema = z
  .object({
    workspaceId: objectIdSchema,
    folderId: objectIdSchema.optional(),
    assetIds: z.array(objectIdSchema).min(1).max(LIMITS.message.attachmentsMax),
    confirmVisibilityExpansion: z.boolean().default(false),
  })
  .strict();
export type ToResourceDto = z.infer<typeof toResourceSchema>;
