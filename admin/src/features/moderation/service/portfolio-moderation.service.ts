import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminPortfolio,
  PortfolioRestorePayload,
  PortfolioTakedownPayload,
} from '../types/portfolio-moderation.types';
import { portfolioModerationApi } from './portfolio-moderation.api';

/**
 * Service THUẦN. `detail` tắt toast tự động: 404 (hồ sơ không còn) là TRẠNG THÁI khối portfolio vẽ tại chỗ. Gỡ/mở lại để interceptor toast lỗi
 * như mọi hành động ghi khác.
 */
export const portfolioModerationService = {
  detail: async (portfolioId: string): Promise<ApiResponse<AdminPortfolio>> =>
    (
      await apiClient.get<ApiResponse<AdminPortfolio>>(portfolioModerationApi.detail(portfolioId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  takedown: async ({
    portfolioId,
    ...body
  }: PortfolioTakedownPayload): Promise<ApiResponse<AdminPortfolio>> =>
    (
      await apiClient.post<ApiResponse<AdminPortfolio>>(
        portfolioModerationApi.takedown(portfolioId),
        body,
      )
    ).data,

  restore: async ({
    portfolioId,
    reason,
  }: PortfolioRestorePayload): Promise<ApiResponse<AdminPortfolio>> =>
    (
      await apiClient.post<ApiResponse<AdminPortfolio>>(
        portfolioModerationApi.restore(portfolioId),
        { reason },
      )
    ).data,
};
