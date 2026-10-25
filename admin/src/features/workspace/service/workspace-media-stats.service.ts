import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { WorkspaceMediaStats } from '../types/workspace-media-stats.types';
import { workspaceMediaStatsApi } from './workspace-media-stats.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceMediaStatsService = {
  stats: async (workspaceId: string, days: number): Promise<ApiResponse<WorkspaceMediaStats>> =>
    (
      await apiClient.get<ApiResponse<WorkspaceMediaStats>>(
        workspaceMediaStatsApi.stats(workspaceId),
        {
          params: { days },
          // Tab tự vẽ trạng thái lỗi (403, 404 `CFG_005` là ca bình thường) — interceptor toast thêm là hai thông báo cho một lỗi.
          skipErrorToast: true,
        } as RequestConfig,
      )
    ).data,
};
