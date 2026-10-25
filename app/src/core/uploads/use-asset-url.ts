import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { uploadService } from './upload.service';
import type { AssetVariant } from './upload.types';

interface AssetUrlResult {
  url: string;
  expiresAt: string;
}

/**
 * URL xem một asset READY — app.md §4 `staleTime: 45_000, gcTime: 60_000`.
 *
 * ⚠️ `staleTime` PHẢI ngắn hơn TTL ký thật của BE (`signedUrlTtlMaxSeconds` ≤
 * 60 s, be.md §7): để React Query coi URL "còn mới" lâu hơn TTL thật là phát
 * cho `expo-image`/`<Image>` một URL đã hết hạn (403 từ storage) mà không ai
 * hay đi xin lại.
 *
 * Lỗi tải ảnh (403 do URL hết hạn) → nơi gọi tự `refetch()` MỘT lần, xem
 * app.md §4.
 */
export function useAssetUrl(
  assetId: string | undefined,
  variant: AssetVariant = 'ORIGINAL',
): UseQueryResult<AssetUrlResult> {
  return useQuery({
    queryKey: ['assets', 'url', assetId, variant],
    queryFn: () => uploadService.getAssetUrl(assetId as string, variant),
    enabled: Boolean(assetId),
    staleTime: 45_000,
    gcTime: 60_000,
    retry: 1,
  });
}
