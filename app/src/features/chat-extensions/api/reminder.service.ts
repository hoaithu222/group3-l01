import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { chatExtPaths } from './chat-extensions.api';
import type { ReminderTab, ReminderView, RemindersPage } from './chat-extensions.types';

/** Nhắc lại tin (BE `message-reminder.controller.ts`). ⛔ `skipErrorToast` — lỗi `REMIND_*`/`MSG_012` do feature hiện trong tấm. */
export const reminderService = {
  /** 201. `remindAt` = ISO UTC trong `[+minLead, +remindAtMaxDays]`; tin không đọc được → 404 `MSG_012`. */
  async create(messageId: string, input: { remindAt: string; timezone: string }): Promise<ReminderView> {
    const response = await apiClient.post<ReminderView>(chatExtPaths.messageReminders(messageId), input, {
      skipErrorToast: true,
    });
    return unwrapData<ReminderView>(response);
  },

  /** Cursor `(remindAt, id)`. ⛔ Đọc `response.data.data` + `.meta` TRỰC TIẾP (không `unwrapData` — vứt `meta`). */
  async listMine(params: { status: ReminderTab; cursor?: string; limit?: number }): Promise<RemindersPage> {
    const response = await apiClient.get<RemindersPage>(chatExtPaths.myReminders, {
      params,
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  /** 204; không phải của mình/không tồn tại → 404; đã phát/đã huỷ → yên lặng. */
  async cancel(id: string): Promise<void> {
    await apiClient.delete(chatExtPaths.reminder(id), { skipErrorToast: true });
  },

  /**
   * Nhóm chứa một KÊNH — `ReminderView` chỉ mang `scopeId`, mà route kênh cần `wsId`. Đọc thẳng `GET /channels/:id` (endpoint của `channels`, khai độc lập — không import chéo feature), chỉ lấy `workspaceId`.
   * Không có/không đọc được ⇒ `null` (nơi gọi báo "Tin không còn khả dụng").
   */
  async channelWorkspaceId(channelId: string): Promise<string | null> {
    const response = await apiClient.get<{ workspaceId?: string }>(chatExtPaths.channel(channelId), { skipErrorToast: true });
    const workspaceId = unwrapData<{ workspaceId?: string }>(response).workspaceId;
    return typeof workspaceId === 'string' && workspaceId.length > 0 ? workspaceId : null;
  },
};
