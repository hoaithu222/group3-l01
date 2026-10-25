import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

/** Lời nhắn kèm lời mời — `sanitizeInput` đã bỏ HTML; giới hạn 500 ký tự (be.md §3). */
const messageSchema = z.string().trim().max(500).optional();

/** Email mời — `.email()` của Zod chấp nhận `a@b.c`; chuẩn hoá `lowercase + trim` làm ở service (`normalizeEmail`). */
const emailSchema = z.string().trim().email("Email không hợp lệ").max(254);

export const inviteGuestSchema = z.object({
  email: emailSchema,
  channelIds: z.array(objectIdSchema).min(1).max(LIMITS.guest.designatedChannelsMax),
  days: z.number().int().min(1).max(LIMITS.guest.maxDays).default(LIMITS.guest.defaultDays),
  message: messageSchema,
});
export type InviteGuestDto = z.infer<typeof inviteGuestSchema>;

export const inviteMembersSchema = z.object({
  emails: z.array(emailSchema).min(1).max(20),
  message: messageSchema,
});
export type InviteMembersDto = z.infer<typeof inviteMembersSchema>;

export const listInvitationsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]).optional(),
});
export type ListInvitationsQueryDto = z.infer<typeof listInvitationsQuerySchema>;

/** Bảng admin: phân trang page/limit (conventions §2), không cursor. */
export const adminListInvitationsQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListInvitationsQueryDto = z.infer<typeof adminListInvitationsQuerySchema>;

/** Token lời mời email: 32 byte → base64url 43 ký tự (giống `inviteTokenParamSchema` của link mời). */
export const invitationTokenParamSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Mã mời không hợp lệ"),
});
export const invitationIdParamSchema = z.object({ invitationId: objectIdSchema });
export const workspaceIdParamSchema = z.object({ workspaceId: objectIdSchema });
