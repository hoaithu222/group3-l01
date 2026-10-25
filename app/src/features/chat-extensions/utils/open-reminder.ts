import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import type { ReminderView } from '../api/chat-extensions.types';
import { reminderService } from '../api/reminder.service';

/**
 * Mở đúng tin của một lời nhắc (`?m=<messageId>` — cùng quy ước với hộp thư/thông báo). Hội thoại: route có sẵn `scopeId`. Kênh: route cần `wsId` mà `ReminderView` không mang ⇒ tra nhóm của kênh
 * một lần (`reminderService.channelWorkspaceId`). Không dựng được đích (kênh không còn/mất quyền) ⇒ toast trung tính "Tin không còn khả dụng" — màn đích cũng tự hiện 403/404 nếu tin đã gỡ.
 *
 * ⛔ Mỗi nhánh `router.push` bằng một `if` riêng: `Href` đã hàng trăm mục, dựng bằng `cond ? a : b` làm TS rút gọn union quá giới hạn (TS2590).
 */
export async function openReminderMessage(reminder: ReminderView): Promise<void> {
  if (reminder.unavailable) {
    showToast('info', 'Tin không còn khả dụng');
    return;
  }
  if (reminder.scopeType === 'CONVERSATION') {
    router.push({
      pathname: '/messages/[conversationId]',
      params: { conversationId: reminder.scopeId, m: reminder.messageId },
    });
    return;
  }
  const wsId = await reminderService.channelWorkspaceId(reminder.scopeId).catch(() => null);
  if (!wsId) {
    showToast('info', 'Tin không còn khả dụng');
    return;
  }
  router.push({
    pathname: '/workspaces/[wsId]/channels/[chId]',
    params: { wsId, chId: reminder.scopeId, m: reminder.messageId },
  });
}
