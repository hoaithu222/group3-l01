import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AdminMeetingListParams } from '../types/workspace-meetings.types';
import { workspaceMeetingsService } from './workspace-meetings.service';

export const workspaceMeetingsKeys = {
  all: (workspaceId: string) => ['workspace', 'meetings', workspaceId] as const,
  list: (workspaceId: string, params: AdminMeetingListParams) =>
    ['workspace', 'meetings', workspaceId, params] as const,
};

/**
 * Danh sách cuộc họp của workspace (chỉ metadata). Đổi trang/lọc giữ bảng cũ mờ đi thay vì nháy trắng (`keepPreviousData`).
 * `retry: false` — lỗi thật (403, 404 `CFG_005` khi cờ tắt giữa chừng) không nên thử lại lặp.
 */
export const useAdminWorkspaceMeetings = (workspaceId: string, params: AdminMeetingListParams) =>
  useQuery({
    queryKey: workspaceMeetingsKeys.list(workspaceId, params),
    queryFn: () => workspaceMeetingsService.list(workspaceId, params),
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
    retry: false,
  });
