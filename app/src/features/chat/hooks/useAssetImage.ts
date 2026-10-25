import { useState } from 'react';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import type { AssetVariant } from '@/core/uploads/upload.types';

interface AssetImageActions {
  /** Gắn vào `onError` của ảnh: tải lỗi lần đầu thì tự xin URL mới MỘT lần, lỗi tiếp thì chuyển sang `failed`. */
  onImageError: () => void;
  /** Người dùng bấm "tải lại" ở ô lỗi: xin URL ký mới và cho ảnh thử lại. */
  retry: () => void;
}

/** `ready` mới có `url`; `loading`/`failed` thì vẽ khung giữ chỗ / ô lỗi. */
export type AssetImage = AssetImageActions &
  (
    | { state: 'failed'; url?: undefined }
    | { state: 'loading'; url?: undefined }
    | { state: 'ready'; url: string }
  );

/**
 * URL ảnh của một asset + xử lý ảnh KHÔNG TẢI ĐƯỢC — chỗ dùng `expo-image` với URL ký có hạn (ảnh/video trong chat).
 *
 * ── Vì sao không chỉ `useAssetUrl` ───────────────────────────────────────────
 * URL ký sống ≤ 60 s (`staleTime` 45 s, xem `useAssetUrl`). Ảnh nằm trong danh sách lâu hơn thế rồi mới vẽ lại → 403, mà
 * `expo-image` gặp lỗi thì vẽ TRONG SUỐT và IM LẶNG (bẫy `Thumbnail`/`Avatar` đã gói lại): ô ảnh chỉ còn nền xám, người dùng
 * không biết là lỗi và không có cách nào tải lại. `useAssetUrl` đã ghi rõ hợp đồng: "nơi gọi tự `refetch()` MỘT lần". Hook
 * này là nơi làm việc đó, để ba nơi dùng (`ImageGrid`, `VideoThumb`, `MediaViewerItem`) không mỗi nơi tự viết một bản:
 *
 *  1. ảnh lỗi lần đầu ⇒ xin URL mới, ảnh tự thử lại (người dùng không thấy gì);
 *  2. lỗi tiếp ⇒ `failed` — ô lỗi kèm "chạm để thử lại" (`retry`), không thử vô hạn.
 *
 * ⚠️ Nhớ CHÍNH URL đã hỏng (không phải một cờ `boolean`): ô được tái sử dụng cho ảnh khác (danh sách cuộn) hoặc URL mới về
 * thì cờ cũ sẽ kẹt ở "hỏng" — cùng lý do ghi ở `Avatar.tsx`.
 */
export function useAssetImage(
  assetId: string | undefined,
  variant: AssetVariant = 'ORIGINAL',
): AssetImage {
  const { data, isError, isLoading, refetch } = useAssetUrl(assetId, variant);
  const [autoRetried, setAutoRetried] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = data?.url;

  const actions: AssetImageActions = {
    onImageError: () => {
      if (!autoRetried) {
        setAutoRetried(true);
        void refetch();
        return;
      }
      setFailedUrl(url);
    },
    retry: () => {
      setFailedUrl(undefined);
      void refetch();
    },
  };

  if (isLoading) return { ...actions, state: 'loading' };
  if (isError || url === undefined || url === failedUrl) return { ...actions, state: 'failed' };
  return { ...actions, state: 'ready', url };
}
