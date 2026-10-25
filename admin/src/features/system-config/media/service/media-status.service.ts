import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { MediaStatus } from '../types/media-status.types';
import { mediaStatusApi } from './media-status.api';

/**
 * Service THUẦN. Tắt toast lỗi tự động: `MEDIA_001` (chưa cấu hình LiveKit) là một
 * TRẠNG THÁI mà tab hiện thành khối hướng dẫn, không phải sự cố để toast; lỗi mạng/5xx khác
 * tab tự vẽ `Callout` + "Thử lại" (30 giây/lần polling mà toast mỗi lần sẽ rất ồn).
 */
export const mediaStatusService = {
  status: async (): Promise<ApiResponse<MediaStatus>> =>
    (
      await apiClient.get<ApiResponse<MediaStatus>>(mediaStatusApi.status, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
