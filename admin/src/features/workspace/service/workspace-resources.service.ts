import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  ResetResourceQuotaPayload,
  ResourceQuotaResult,
  ResourceStatsView,
  SetResourceQuotaPayload,
} from '../types/workspace-resources.types';
import { workspaceResourcesApi } from './workspace-resources.api';

/**
 * Cả ba lời gọi tắt toast lỗi tự động: tab tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005` là ca bình
 * thường) và modal đặt hạn mức có banner riêng cho 409 `RES_003` — để interceptor toast thêm là
 * hai thông báo cho một lỗi. Hook (`workspace-resources.queries.ts`) toast phần còn lại.
 */
const QUIET = { skipErrorToast: true } as RequestConfig;

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceResourcesService = {
  stats: async (workspaceId: string): Promise<ApiResponse<ResourceStatsView>> =>
    (
      await apiClient.get<ApiResponse<ResourceStatsView>>(
        workspaceResourcesApi.stats(workspaceId),
        QUIET,
      )
    ).data,

  setQuota: async (
    workspaceId: string,
    payload: SetResourceQuotaPayload,
  ): Promise<ApiResponse<ResourceQuotaResult>> =>
    (
      await apiClient.put<ApiResponse<ResourceQuotaResult>>(
        workspaceResourcesApi.quota(workspaceId),
        payload,
        QUIET,
      )
    ).data,

  resetQuota: async (
    workspaceId: string,
    payload: ResetResourceQuotaPayload,
  ): Promise<ApiResponse<ResourceQuotaResult>> =>
    (
      await apiClient.post<ApiResponse<ResourceQuotaResult>>(
        workspaceResourcesApi.quotaReset(workspaceId),
        payload,
        QUIET,
      )
    ).data,
};
