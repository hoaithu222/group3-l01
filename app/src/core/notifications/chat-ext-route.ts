import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Mở rộng chat (p7-04): thông báo `scheduled-message.failed` và `message.reminder` (BE `chat-extensions-notification-types.ts`, `dataKeys` chỉ có id — KHÔNG nội dung tin/tên kênh). Tách khỏi
 * `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `o2o-route.ts`).
 *
 *  · `scheduled-message.failed` → "Tin đã hẹn" mở sẵn tab Lỗi, tô dòng `?id=` (thiếu `scheduledMessageId` → chỉ mở danh sách).
 *  · `message.reminder`:
 *      - `unavailable` (tin đã gỡ/mất quyền lúc đến hạn — BE không gửi `messageId`) → "Nhắc lại của tôi", nơi dòng hiện "Tin không còn khả dụng";
 *      - hội thoại → mở đúng tin (`?m=`); KÊNH → "Nhắc lại của tôi" (push không mang `workspaceId` nên chưa dựng được route kênh; danh sách tra nhóm rồi mở tin khi chạm).
 *
 * ⛔ `Href` dựng bằng `return` tường minh, KHÔNG `cond ? a : b`: `Href` đã hàng trăm mục, rút gọn union quá giới hạn (TS2590). Không kiểm quyền ở đây — màn đích tự hiện "không còn khả dụng".
 */
export function isChatExtType(type: string): boolean {
  return type === 'scheduled-message.failed' || type === 'message.reminder';
}

export function chatExtHref(target: NotificationTarget): Href | null {
  if (target.type === 'scheduled-message.failed') {
    if (!target.scheduledMessageId) return '/me/scheduled-messages';
    return { pathname: '/me/scheduled-messages', params: { id: target.scheduledMessageId } };
  }
  if (target.unavailable || !target.messageId) return '/me/reminders';
  if (target.scopeType === 'CONVERSATION' && target.scopeId) {
    return { pathname: '/messages/[conversationId]', params: { conversationId: target.scopeId, m: target.messageId } };
  }
  return '/me/reminders';
}
