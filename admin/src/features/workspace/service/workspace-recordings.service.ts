import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminRecordingDetail,
  AdminRecordingListParams,
  AdminRecordingRow,
  AdminRecordingSummary,
} from '../types/workspace-recordings.types';
import { workspaceRecordingsApi } from './workspace-recordings.api';

/** Tab/ngăn kéo tự vẽ trạng thái lỗi (403/404 `CFG_005` là ca bình thường) — interceptor toast thêm là hai thông báo cho một lỗi. */
const OWN_ERROR_UI = { skipErrorToast: true } as RequestConfig;

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceRecordingsService = {
  list: async (params: AdminRecordingListParams): Promise<ApiResponse<AdminRecordingRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminRecordingRow[]>>(workspaceRecordingsApi.list, {
        params,
        ...OWN_ERROR_UI,
      } as RequestConfig)
    ).data,

  summary: async (workspaceId?: string): Promise<ApiResponse<AdminRecordingSummary>> =>
    (
      await apiClient.get<ApiResponse<AdminRecordingSummary>>(workspaceRecordingsApi.summary, {
        params: workspaceId ? { workspaceId } : undefined,
        ...OWN_ERROR_UI,
      } as RequestConfig)
    ).data,

  detail: async (recordingId: string): Promise<ApiResponse<AdminRecordingDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminRecordingDetail>>(
        workspaceRecordingsApi.detail(recordingId),
        OWN_ERROR_UI,
      )
    ).data,

  /** `DELETE ?reason=` → 204. Lỗi (`REC_005` đã xoá, `MEET_009` còn đang ghi) để interceptor toast, nơi gọi tự đóng hộp thoại. */
  remove: async ({
    recordingId,
    reason,
  }: {
    recordingId: string;
    reason: string;
  }): Promise<void> => {
    await apiClient.delete(workspaceRecordingsApi.detail(recordingId), { params: { reason } });
  },
};
