import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  BurnoutRules,
  PutBurnoutRulesPayload,
  WellbeingOverview,
} from '../types/wellbeing.types';
import { wellbeingApi } from './wellbeing.api';

/**
 * Lệnh ĐỌC tắt toast của interceptor: màn hình tự vẽ trạng thái lỗi (`Callout` + "Thử lại") — toast biến mất sau vài giây nên không thay được.
 * Lệnh GHI để interceptor toast (kể cả `RES_003` "dữ liệu đã thay đổi, vui lòng tải lại", `WELL_003`, `WELL_004`).
 */
const OWN_ERROR: RequestConfig = { skipErrorToast: true };

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. Không hàm nào nhận định danh người dùng. */
export const wellbeingService = {
  overview: async (weeks: number): Promise<ApiResponse<WellbeingOverview>> =>
    (
      await apiClient.get<ApiResponse<WellbeingOverview>>(wellbeingApi.overview, {
        params: { weeks },
        ...OWN_ERROR,
      })
    ).data,

  rules: async (): Promise<ApiResponse<BurnoutRules>> =>
    (await apiClient.get<ApiResponse<BurnoutRules>>(wellbeingApi.rules, OWN_ERROR)).data,

  putRules: async (payload: PutBurnoutRulesPayload): Promise<ApiResponse<BurnoutRules>> =>
    (await apiClient.put<ApiResponse<BurnoutRules>>(wellbeingApi.rules, payload)).data,
};
