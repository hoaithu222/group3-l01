import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { AdminMeetingListParams, AdminMeetingRow } from '../types/workspace-meetings.types';
import { workspaceMeetingsApi } from './workspace-meetings.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceMeetingsService = {
  list: async (
    workspaceId: string,
    params: AdminMeetingListParams,
  ): Promise<ApiResponse<AdminMeetingRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminMeetingRow[]>>(workspaceMeetingsApi.list(workspaceId), {
        params,
        // Tab tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005` là ca bình thường) — interceptor toast thêm là hai thông báo cho một lỗi.
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
