import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import { plagiarismApi } from './plagiarism.api';
import type {
  PlagiarismConfig,
  PlagiarismOverview,
  PlagiarismRange,
  ReindexPayload,
  ReindexResult,
  UpdatePlagiarismConfigPayload,
} from './plagiarism.types';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const plagiarismService = {
  getOverview: async (range: PlagiarismRange): Promise<ApiResponse<PlagiarismOverview>> =>
    (await apiClient.get<ApiResponse<PlagiarismOverview>>(plagiarismApi.overview, { params: { range } })).data,

  getConfig: async (): Promise<ApiResponse<PlagiarismConfig>> =>
    (await apiClient.get<ApiResponse<PlagiarismConfig>>(plagiarismApi.config)).data,

  updateConfig: async (payload: UpdatePlagiarismConfigPayload): Promise<ApiResponse<PlagiarismConfig>> =>
    (await apiClient.put<ApiResponse<PlagiarismConfig>>(plagiarismApi.config, payload)).data,

  reindex: async (payload: ReindexPayload): Promise<ApiResponse<ReindexResult>> =>
    (await apiClient.post<ApiResponse<ReindexResult>>(plagiarismApi.reindex, payload)).data,
};
