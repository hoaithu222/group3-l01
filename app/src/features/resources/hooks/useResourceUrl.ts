import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { resourcesService, type ResourceUrlDto, type ResourceUrlVariant } from '../api';
import { RESOURCE_ERROR } from '../constants/resource-error-codes.constants';
import { resourceKeys } from '../queries/resources.keys';
import { extractErrorCode } from '../utils/error-messages';

export interface UseResourceUrlResult {
  data: ResourceUrlDto | undefined;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  /** `RSC_005` — tệp chưa có bản xem trước (Office chưa chuyển, P1). Không phải lỗi mạng: đừng thử lại. */
  noPreview: boolean;
  /** Xin URL MỚI ngay (URL cũ hết hạn/403) — trả URL mới hoặc `undefined` nếu lỗi. */
  refresh: () => Promise<ResourceUrlDto | undefined>;
}

/**
 * URL ký ≤ 60 s của một tệp (app.md p3-01 §4 `staleTime 45 s`, `gcTime 60 s`).
 *
 * ⚠️ `staleTime` PHẢI ngắn hơn TTL ký thật của BE: coi URL "còn mới" lâu hơn TTL
 * là phát cho `expo-image`/player một URL đã hết hạn (403 từ storage) mà không
 * ai hay. Nơi giữ URL lâu (video đang phát, ảnh lỗi tải) tự gọi `refresh()`
 * khi gặp lỗi thay vì trông vào tự làm mới theo giờ.
 *
 * `RSC_005` không retry (server nói rõ "chưa có bản xem trước") — retry chỉ làm
 * chậm màn "Chưa xem trước được".
 */
export function useResourceUrl(
  resourceId: string | undefined,
  variant: ResourceUrlVariant = 'original',
  enabled = true,
): UseResourceUrlResult {
  const query = useQuery({
    queryKey: resourceKeys.url(resourceId ?? '', variant),
    queryFn: () => resourcesService.url(resourceId as string, variant),
    enabled: Boolean(resourceId) && enabled,
    staleTime: 45_000,
    gcTime: 60_000,
    retry: (count, error) => extractErrorCode(error) !== RESOURCE_ERROR.NO_PREVIEW && count < 1,
  });

  const { refetch } = query;
  const refresh = useCallback(async () => (await refetch()).data, [refetch]);

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    noPreview: extractErrorCode(query.error) === RESOURCE_ERROR.NO_PREVIEW,
    refresh,
  };
}
