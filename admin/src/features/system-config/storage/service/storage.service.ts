import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  StorageCleanupPayload,
  StorageCleanupResult,
  StorageStats,
} from '../types/storage.types';
import { storageApi } from './storage.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const storageService = {
  getStats: async (workspaceId?: string): Promise<ApiResponse<StorageStats>> =>
    (
      await apiClient.get<ApiResponse<StorageStats>>(storageApi.stats, {
        params: { workspaceId },
      })
    ).data,

  cleanup: async (payload: StorageCleanupPayload): Promise<ApiResponse<StorageCleanupResult>> =>
    (await apiClient.post<ApiResponse<StorageCleanupResult>>(storageApi.cleanup, payload)).data,
};
