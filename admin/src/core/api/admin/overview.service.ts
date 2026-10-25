import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import { insightsApi } from './insights.api';
import type { AdminInsights, InsightsRange } from './insights.types';
import { overviewApi } from './overview.api';
import type { AdminOverview } from './overview.types';

export const overviewService = {
  get: async (range = '7d'): Promise<ApiResponse<AdminOverview>> =>
    (await apiClient.get<ApiResponse<AdminOverview>>(overviewApi.get, { params: { range } })).data,

  /** Số liệu phân tích cho biểu đồ xu hướng / so với kỳ trước (khác `get`: KHÔNG gồm số realtime). */
  insights: async (range: InsightsRange = '30d'): Promise<ApiResponse<AdminInsights>> =>
    (await apiClient.get<ApiResponse<AdminInsights>>(insightsApi.get, { params: { range } })).data,
};
