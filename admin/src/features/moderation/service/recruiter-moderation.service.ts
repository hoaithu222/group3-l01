import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  OfferWithdrawPayload,
  OfferWithdrawResult,
  ReportedOffer,
} from '../types/recruiter-moderation.types';
import { recruiterModerationApi } from './recruiter-moderation.api';

/**
 * Service THUẦN. `reported` tắt toast: 404 (lời mời không còn / chưa có báo cáo) là TRẠNG THÁI khối vẽ tại chỗ. Thu hồi để interceptor toast lỗi
 * như mọi hành động ghi khác.
 */
export const recruiterModerationService = {
  reported: async (offerId: string): Promise<ApiResponse<ReportedOffer>> =>
    (
      await apiClient.get<ApiResponse<ReportedOffer>>(recruiterModerationApi.reported(offerId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  withdraw: async ({
    offerId,
    reason,
  }: OfferWithdrawPayload): Promise<ApiResponse<OfferWithdrawResult>> =>
    (
      await apiClient.post<ApiResponse<OfferWithdrawResult>>(
        recruiterModerationApi.withdraw(offerId),
        { reason },
      )
    ).data,
};
