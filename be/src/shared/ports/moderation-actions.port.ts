/**
 * Các cổng hành động cấp NỀN TẢNG mà `modules/moderation` (p1-08 be.md §5.6)
 * gọi vào module sở hữu dữ liệu — mỗi module cài đặt + export factory qua
 * `public.ts`/`index.ts` của nó; moderation KHÔNG import service nội bộ.
 */

/** `modules/users` — khoá tài khoản (thu hồi session + đá socket + audit `user.lock`). */
export interface UsersAdminPort {
  lock(userId: string, actorId: string, reason: string): Promise<void>;
}

/** `modules/channels` — lưu trữ kênh PUBLIC cấp nền tảng (`CH_012` với kênh riêng tư, `CH_005` với kênh mặc định). */
export interface ChannelAdminPort {
  platformArchive(adminId: string, channelId: string, reason: string): Promise<void>;
}

/** `modules/conversations` — giải tán nhóm chat cấp nền tảng (idempotent). */
export interface ConversationAdminPort {
  platformDissolve(adminId: string, conversationId: string): Promise<void>;
}
