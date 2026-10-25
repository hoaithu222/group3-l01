import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { stripHtml } from "../../../core/utils/html-sanitizer";

export const createInviteSchema = z.object({
  expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168)]).default(24),
  maxUses: z.coerce
    .number()
    .int()
    .min(LIMITS.invite.maxUsesMin)
    .max(LIMITS.invite.maxUsesMax)
    .default(LIMITS.invite.defaultMaxUses),
});
export type CreateInviteDto = z.infer<typeof createInviteSchema>;

export const inviteTokenParamSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Mã mời không hợp lệ") });
export type InviteTokenParamDto = z.infer<typeof inviteTokenParamSchema>;

/** Trần lời nhắn xin vào nhóm (ký tự) — cùng trần lời nhắn của lời mời (`invitation.dto.ts`, be.md p3-04 §3). */
export const INVITE_REQUEST_MESSAGE_MAX = 500;

/**
 * Body tuỳ chọn của `POST /invites/:token/accept` (p3-04 §5.5): `requestMessage` = lời nhắn xin vào nhóm bật duyệt (`joinPolicy=APPROVAL`) hiện ở danh sách yêu cầu của
 * OWNER/ADMIN. Chỉ được lưu khi lượt chấp nhận tạo yêu cầu PENDING (nhóm không duyệt → bỏ qua). Văn bản thuần: bỏ ký tự điều khiển (giữ xuống dòng), `stripHtml`
 * (không phụ thuộc `sanitizeInput` toàn cục), cắt khoảng trắng; chuỗi rỗng sau đó = không gửi. Tối đa `INVITE_REQUEST_MESSAGE_MAX` (500) ký tự.
 */
export const acceptInviteSchema = z.object({
  requestMessage: z
    .string()
    .max(INVITE_REQUEST_MESSAGE_MAX)
    .transform((s) => stripHtml(s.replace(/[^\P{Cc}\n]/gu, "")))
    .transform((s) => (s.length > 0 ? s : undefined))
    .optional(),
});
export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;
