import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { ReviewStatsView } from '../types/peer-review.types';
import { peerReviewApi } from './peer-review.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const peerReviewService = {
  /** Số đếm chấm chéo trong `days` ngày gần nhất; khối tự vẽ trạng thái lỗi/cờ tắt nên bỏ toast của interceptor. */
  stats: async (workspaceId: string, days: number): Promise<ApiResponse<ReviewStatsView>> =>
    (
      await apiClient.get<ApiResponse<ReviewStatsView>>(peerReviewApi.stats(workspaceId), {
        params: { days },
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
