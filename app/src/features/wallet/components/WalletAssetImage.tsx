import { Pressable } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

export interface WalletAssetImageProps {
  /** Mô tả cho trình đọc màn hình ("Ảnh hoá đơn", "Ảnh chứng từ chuyển khoản"). */
  alt: string;
  assetId: string;
}

/**
 * Ảnh hoá đơn/chứng từ qua URL KÝ (`useAssetUrl`, sống ≤ 60 s).
 *
 * URL hết hạn giữa chừng thì `Thumbnail` rơi về ô giữ chỗ (lỗi tải 403) — bấm vào ảnh
 * để xin URL mới. Không tự thử lại vòng lặp: một ảnh hỏng thật (đã bị xoá) sẽ chớp
 * mãi nếu ta cứ refetch.
 */
export function WalletAssetImage({ alt, assetId }: WalletAssetImageProps) {
  const { data, isPending, refetch } = useAssetUrl(assetId);

  if (isPending) return <Skeleton className="h-40 rounded-sm" />;

  return (
    <Pressable
      accessibilityHint="Bấm để tải lại ảnh nếu không hiện"
      accessibilityLabel={alt}
      accessibilityRole="imagebutton"
      onPress={() => void refetch()}
    >
      <Thumbnail alt={alt} aspect="banner-slim" source={data ? { uri: data.url } : undefined} />
    </Pressable>
  );
}
