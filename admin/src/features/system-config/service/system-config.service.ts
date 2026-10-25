import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  ResetSystemConfigPayload,
  SystemConfigItem,
  UpdateSystemConfigPayload,
} from '../types/system-config.types';
import { systemConfigApi } from './system-config.api';

/**
 * Service THUẦN. `update`/`reset` tắt toast lỗi tự động: 409 `RES_003` và 400
 * `CFG_002` có giao diện riêng (banner tải lại, lỗi gắn đúng ô) — hook
 * (`system-config.queries.ts`) tự toast các lỗi còn lại.
 */
export const systemConfigService = {
  list: async (): Promise<ApiResponse<SystemConfigItem[]>> =>
    (await apiClient.get<ApiResponse<SystemConfigItem[]>>(systemConfigApi.list)).data,

  get: async (key: string): Promise<ApiResponse<SystemConfigItem>> =>
    (await apiClient.get<ApiResponse<SystemConfigItem>>(systemConfigApi.detail(key))).data,

  update: async (
    key: string,
    payload: UpdateSystemConfigPayload,
  ): Promise<ApiResponse<SystemConfigItem>> =>
    (
      await apiClient.put<ApiResponse<SystemConfigItem>>(systemConfigApi.detail(key), payload, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  reset: async (
    key: string,
    payload: ResetSystemConfigPayload,
  ): Promise<ApiResponse<SystemConfigItem>> =>
    (
      await apiClient.post<ApiResponse<SystemConfigItem>>(systemConfigApi.reset(key), payload, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
