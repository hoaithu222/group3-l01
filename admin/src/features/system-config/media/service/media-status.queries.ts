import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';

import { MEDIA_NOT_CONFIGURED_CODE, MEDIA_STATUS_REFETCH_MS } from '../constants/media.constants';
import { mediaStatusService } from './media-status.service';

export const mediaKeys = {
  status: ['system-config', 'media', 'status'] as const,
};

/** `true` khi lỗi là `503 MEDIA_001` — chưa cấu hình `LIVEKIT_*` (không phải sự cố). */
export const isMediaNotConfigured = (error: unknown): boolean =>
  extractErrorCode(error as AxiosError) === MEDIA_NOT_CONFIGURED_CODE;

/**
 * Trạng thái máy chủ media — tự làm mới 30 giây khi tab trình duyệt hiện
 * (`refetchIntervalInBackground: false`). Không `retry`: đây là trang theo dõi có polling
 * sẵn — lỗi thoáng qua tự hết ở lượt sau, còn `MEDIA_001` (thiếu cấu hình) thì gọi lại vẫn
 * thiếu, chỉ làm trạng thái "Chưa cấu hình" hiện chậm hơn.
 */
export const useMediaStatus = () =>
  useQuery({
    queryKey: mediaKeys.status,
    queryFn: () => mediaStatusService.status(),
    select: (res) => res.data,
    refetchInterval: MEDIA_STATUS_REFETCH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
