import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminLiveQuizListParams,
  AdminLiveQuizSession,
  AdminLiveQuizSessionDetail,
  EndLiveQuizPayload,
  EndLiveQuizResult,
} from '../types/live-quiz-ops.types';
import { liveQuizOpsApi } from './live-quiz-ops.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const liveQuizOpsService = {
  /** Danh sách + trạng thái lỗi do tab tự vẽ (`Callout` + "Thử lại") nên bỏ toast của interceptor. */
  list: async (params: AdminLiveQuizListParams): Promise<ApiResponse<AdminLiveQuizSession[]>> =>
    (
      await apiClient.get<ApiResponse<AdminLiveQuizSession[]>>(liveQuizOpsApi.sessions, {
        params,
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  /** 404 (`QUIZ_001`: id sai/đã bị dọn — deep link) → ngăn kéo tự hiện "không tìm thấy", không toast. */
  get: async (id: string): Promise<ApiResponse<AdminLiveQuizSessionDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminLiveQuizSessionDetail>>(liveQuizOpsApi.session(id), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  /** Lỗi ghi (vd `QUIZ_007` phiên vừa đóng) để interceptor toast như mọi hành động quản trị khác. */
  end: async ({ sessionId, reason }: EndLiveQuizPayload): Promise<ApiResponse<EndLiveQuizResult>> =>
    (
      await apiClient.post<ApiResponse<EndLiveQuizResult>>(liveQuizOpsApi.end(sessionId), {
        reason,
      })
    ).data,
};
