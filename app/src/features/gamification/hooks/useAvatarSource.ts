import type { AvatarProps } from '@/shared/ui/avatar';
import { useAssetUrl } from '@/core/uploads/use-asset-url';

/**
 * Ảnh đại diện từ `avatarAssetId` (bảng xếp hạng, hồ sơ công khai) — BE gamification chỉ trả MÃ asset, không trả URL, nên
 * phải xin URL ký qua `useAssetUrl` (bản `THUMB`: avatar 32–48dp, tải bản gốc là phí băng thông).
 *
 * `null`/chưa có URL ⇒ `undefined`: `Avatar` rơi về chữ viết tắt từ `name` (luôn truyền kèm), nên hàng không bao giờ trống.
 * ⚠️ Không có asset thì query TẮT (`enabled: Boolean(assetId)`) — không phát request nào cho người chưa đặt ảnh.
 */
export function useAvatarSource(assetId: string | null | undefined): AvatarProps['source'] {
  const { data } = useAssetUrl(assetId ?? undefined, 'THUMB');
  return data?.url ? { uri: data.url } : undefined;
}
