import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { ContributionStatsView } from '../types/workspace-contribution.types';
import type { ProjectStatsView } from '../types/workspace-projects.types';
import { workspaceProjectsApi } from './workspace-projects.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceProjectsService = {
  stats: async (workspaceId: string): Promise<ApiResponse<ProjectStatsView>> =>
    (
      await apiClient.get<ApiResponse<ProjectStatsView>>(workspaceProjectsApi.stats(workspaceId), {
        // Tab tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005` là ca bình thường) ngay trong khung —
        // để interceptor toast thêm là hai thông báo cho một lỗi.
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  /** Số đếm sức khoẻ báo cáo đóng góp trong `days` ngày gần nhất (xuất PDF); cùng cách tự vẽ lỗi như `stats`. */
  contributionStats: async (
    workspaceId: string,
    days: number,
  ): Promise<ApiResponse<ContributionStatsView>> =>
    (
      await apiClient.get<ApiResponse<ContributionStatsView>>(
        workspaceProjectsApi.contributionStats(workspaceId),
        { params: { days }, skipErrorToast: true } as RequestConfig,
      )
    ).data,
};
