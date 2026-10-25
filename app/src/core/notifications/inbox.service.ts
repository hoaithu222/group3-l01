import type { AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  InboxCursorMeta,
  InboxPage,
  InboxUnreadCount,
  ListInboxParams,
  ReadAllInboxPayload,
} from './inbox.types';

/**
 * ⛔ Danh sách cursor KHÔNG dùng `unwrapData`: BE trả `{ data: [...], meta }` ở gốc thân, `unwrapData` bóc `.data` và
 * VỨT `meta` → `getNextPageParam` nổ (cùng bẫy `conversationsService.list`).
 */
const cursorPage = ({ data: body }: AxiosResponse<{ data: InboxPage['data']; meta: InboxCursorMeta }>): InboxPage => ({
  data: body.data,
  meta: body.meta,
});

/** Hộp thư "Hoạt động" (p1-07 `be.md` §15.2). Đường dẫn khớp `notifications.routes.ts`. */
export const inboxService = {
  async list(params: ListInboxParams): Promise<InboxPage> {
    const response = await apiClient.get<InboxPage>('/notifications', { params });
    return cursorPage(response);
  },

  async unreadCount(workspaceId?: string): Promise<InboxUnreadCount> {
    const response = await apiClient.get<InboxUnreadCount>('/notifications/unread-count', {
      params: { workspaceId },
    });
    return unwrapData<InboxUnreadCount>(response);
  },

  async markRead(id: string): Promise<{ id: string; readAt: string }> {
    const response = await apiClient.post<{ id: string; readAt: string }>(
      `/notifications/${id}/read`,
    );
    return unwrapData<{ id: string; readAt: string }>(response);
  },

  async readAll(payload: ReadAllInboxPayload): Promise<{ updated: number }> {
    const response = await apiClient.post<{ updated: number }>('/notifications/read-all', payload);
    return unwrapData<{ updated: number }>(response);
  },
};
