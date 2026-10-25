import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { isGrantRoleRef } from "../../../core/constants/role-coverage";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

export const scheduledParamsSchema = z.object({ id: objectIdSchema });

/** Cùng hình với mention của tin thường: `USER`/`ALL` → ObjectId; `ROLE` → `ADMIN`|`MEMBER`. Kiểm sâu (thành viên, hạn mức `@role`) do `IMessageSendPort.validateDraft` (cùng luật `send()`). */
const mentionSchema = z
  .object({ type: z.enum(["USER", "ROLE", "ALL"]), targetId: z.string().optional() })
  .superRefine((mention, ctx) => {
    if (mention.targetId === undefined) return;
    const valid = mention.type === "ROLE" ? isGrantRoleRef(mention.targetId) : objectIdSchema.safeParse(mention.targetId).success;
    if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetId"], message: mention.type === "ROLE" ? "Vai trò phải là ADMIN hoặc MEMBER" : "ID không hợp lệ" });
  });

/**
 * Hẹn giờ gửi một tin — nội dung dùng CÙNG giới hạn với tin thường (`LIMITS.message`). `sendAt` là thời điểm UTC (client đổi từ giờ địa phương); `timezone` IANA CHỈ để hiển thị lại
 * (đổi múi giờ máy sau đó vẫn phát đúng thời điểm UTC đã chốt — SCHED-04); service kiểm IANA hợp lệ và cửa sổ `[+1 phút, +30 ngày]`.
 */
export const createScheduledSchema = z
  .object({
    content: z.string().max(LIMITS.message.maxChars * 4).optional(),
    mentions: z.array(mentionSchema).max(LIMITS.message.mentionsMax).default([]),
    attachmentAssetIds: z.array(objectIdSchema).max(LIMITS.message.attachmentsMax).default([]),
    replyToId: objectIdSchema.optional(),
    /** Chỉ kênh: gửi vào thread (id tin gốc). */
    threadId: objectIdSchema.optional(),
    sendAt: z.coerce.date(),
    timezone: z.string().min(1).max(64),
  })
  .strict();
export type CreateScheduledDto = z.infer<typeof createScheduledSchema>;

/** Sửa khi còn `PENDING`: chỉ trường gửi lên được đổi; `expectedVersion` bắt buộc (lệch → 409 `RES_003`). Ít nhất một trường thay đổi. */
export const updateScheduledSchema = z
  .object({
    content: z.string().max(LIMITS.message.maxChars * 4).optional(),
    mentions: z.array(mentionSchema).max(LIMITS.message.mentionsMax).optional(),
    attachmentAssetIds: z.array(objectIdSchema).max(LIMITS.message.attachmentsMax).optional(),
    replyToId: objectIdSchema.nullable().optional(),
    sendAt: z.coerce.date().optional(),
    timezone: z.string().min(1).max(64).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()
  .refine((body) => Object.keys(body).some((key) => key !== "expectedVersion"), { message: "Cần ít nhất một trường thay đổi" });
export type UpdateScheduledDto = z.infer<typeof updateScheduledSchema>;

export const listMyScheduledQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["PENDING", "FAILED", "SENT", "CANCELLED"]).default("PENDING"),
  scopeType: z.enum(["CHANNEL", "CONVERSATION"]).optional(),
  scopeId: objectIdSchema.optional(),
});
export type ListMyScheduledQueryDto = z.infer<typeof listMyScheduledQuerySchema>;
