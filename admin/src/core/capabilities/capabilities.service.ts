import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import { capabilitiesApi } from './capabilities.api';
import type { Capabilities } from './capabilities.types';

/** Service thuần (không React) — gọi từ `@/app/capabilities` qua React Query. */
export const capabilitiesService = {
  get: async (): Promise<ApiResponse<Capabilities>> =>
    (await apiClient.get<ApiResponse<Capabilities>>(capabilitiesApi.get)).data,
};
