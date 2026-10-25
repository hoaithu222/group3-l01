import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  CleanupSnapshotsResult,
  CollabHealthView,
  CollabStatsView,
  LargeDocumentRow,
} from '../types/collab-ops.types';
import { collabOpsApi } from './collab-ops.api';

/** Service THUẦN cho vận hành collab — lỗi ghi (dọn snapshot) để interceptor toast như mọi hành động quản trị khác. */
export const collabOpsService = {
  health: async (): Promise<ApiResponse<CollabHealthView>> =>
    (await apiClient.get<ApiResponse<CollabHealthView>>(collabOpsApi.health)).data,

  stats: async (): Promise<ApiResponse<CollabStatsView>> =>
    (await apiClient.get<ApiResponse<CollabStatsView>>(collabOpsApi.stats)).data,

  largeDocuments: async (limit: number): Promise<ApiResponse<LargeDocumentRow[]>> =>
    (
      await apiClient.get<ApiResponse<LargeDocumentRow[]>>(collabOpsApi.largeDocuments, {
        params: { limit },
      })
    ).data,

  cleanupSnapshots: async (reason: string): Promise<ApiResponse<CleanupSnapshotsResult>> =>
    (
      await apiClient.post<ApiResponse<CleanupSnapshotsResult>>(collabOpsApi.cleanupSnapshots, {
        reason,
      })
    ).data,
};
