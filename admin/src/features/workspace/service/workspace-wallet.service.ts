import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { WalletStatsView } from '../types/workspace-wallet.types';
import { workspaceWalletApi } from './workspace-wallet.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceWalletService = {
  stats: async (workspaceId: string): Promise<ApiResponse<WalletStatsView>> =>
    (
      await apiClient.get<ApiResponse<WalletStatsView>>(workspaceWalletApi.stats(workspaceId), {
        // Tab tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005` là ca bình thường) ngay
        // trong khung — để interceptor toast thêm là hai thông báo cho một lỗi.
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
