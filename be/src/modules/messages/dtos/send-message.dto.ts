import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";
import { isGrantRoleRef } from "../../../core/constants/role-coverage";

export const attachmentInputSchema = z.object({
  assetId: objectIdSchema,
  /** Chỉ có ý nghĩa cho asset `kind VOICE` — service bỏ qua ở loại khác. */
  waveform: z.array(z.number().int().min(0).max(255)).max(64).optional(),
});
export type AttachmentInputDto = z.infer<typeof attachmentInputSchema>;

/**
 * `targetId`: USER/ALL → ObjectId (như trước); ROLE (p3-04 `@role`) → `ADMIN` | `MEMBER`. Kiểu suy ra không đổi
 * (`{ type; targetId?: string }`) nên mọi nơi dùng `MentionInputDto` giữ nguyên.
 */
export const mentionInputSchema = z
  .object({
    type: z.enum(["USER", "ROLE", "ALL"]),
    targetId: z.string().optional(),
  })
  .superRefine((mention, ctx) => {
    if (mention.targetId === undefined) return;
    const valid = mention.type === "ROLE" ? isGrantRoleRef(mention.targetId) : objectIdSchema.safeParse(mention.targetId).success;
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetId"],
        message: mention.type === "ROLE" ? "Vai trò phải là ADMIN hoặc MEMBER" : "ID không hợp lệ",
      });
    }
  });
export type MentionInputDto = z.infer<typeof mentionInputSchema>;

/**
 * `.strict()` — field lạ (vd `kind`/`systemType` client cố gửi để giả tin hệ
 * thống) bị TỪ CHỐI 400 `VAL_001` thay vì lặng lẽ bỏ qua (be.md §3 comment
 * chọn `.strict()` thay vì `.strip()` — MSG-03 chỉ yêu cầu tin không bị biến
 * thành SYSTEM, không yêu cầu request đó phải thành công dưới dạng USER).
 */
export const sendMessageSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    content: z.string().max(LIMITS.message.maxChars * 4).optional(),
    attachments: z.array(attachmentInputSchema).max(LIMITS.message.attachmentsMax).default([]),
    mentions: z.array(mentionInputSchema).max(LIMITS.message.mentionsMax).default([]),
    replyToId: objectIdSchema.optional(),
    /**
     * Chỉ CHANNEL — xử lý thật (validate + upsert `Thread`/`ThreadSubscription`)
     * qua port `IThreadHook` (p1-06, `core/permission/message-hooks.port.ts`),
     * gọi từ `message.service.ts#send()`. CHƯA đăng ký hook (`registerThreadHook`,
     * vd test cũ không boot đủ `router.ts`) → giữ hành vi p1-04 gốc: chấp
     * nhận + lưu vào `Message.threadId`/`threadKey`, không side-effect.
     */
    threadRootId: objectIdSchema.optional(),
  })
  .strict();
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
