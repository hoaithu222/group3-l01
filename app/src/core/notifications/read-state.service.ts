import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  ReadMarkerPayload,
  ReadMarkerResult,
  UnreadSummary,
  WorkspaceUnread,
} from './read-state.types';

/**
 * Mốc đã đọc + số chưa đọc (p1-07 `be.md` §15.2). Mọi đường dẫn khớp `read-state.routes.ts`.
 *
 * ⚠️ `POST /read-markers` gọi ở nền (debounce, không có người dùng chờ) — lỗi 404 (mất quyền/không thấy luồng) hoặc
 * 429 (120/phút) KHÔNG đáng hiện toast: `skipErrorToast` để nơi gọi tự nuốt (mất mốc đọc không mất dữ liệu, lần
 * hiển thị sau gửi lại).
 */
export const readStateService = {
  async mark(payload: ReadMarkerPayload): Promise<ReadMarkerResult> {
    const response = await apiClient.post<ReadMarkerResult>('/read-markers', payload, {
      skipErrorToast: true,
    });
    return unwrapData<ReadMarkerResult>(response);
  },

  /** `before` do CLIENT chốt lúc bấm (ISO) — tin đến sau đó vẫn chưa đọc (NT-13). */
  async readAllConversations(before: string): Promise<{ updated: number }> {
    const response = await apiClient.post<{ updated: number }>('/me/read-all-conversations', {
      before,
    });
    return unwrapData<{ updated: number }>(response);
  },

  async getSummary(): Promise<UnreadSummary> {
    const response = await apiClient.get<UnreadSummary>('/me/unread/summary');
    return unwrapData<UnreadSummary>(response);
  },

  async getWorkspaceUnread(workspaceId: string): Promise<WorkspaceUnread> {
    const response = await apiClient.get<WorkspaceUnread>('/me/unread', {
      params: { workspaceId },
    });
    return unwrapData<WorkspaceUnread>(response);
  },
};
