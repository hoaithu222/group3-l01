import { Pressable } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail, type MediaCardAspect } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

export interface StudyAssetImageProps {
  /** Mô tả cho trình đọc màn hình ("Ảnh mặt trước") — ảnh học tập MANG nghĩa nên luôn có mô tả. */
  alt: string;
  aspect?: MediaCardAspect | number;
  assetId: string;
  className?: string;
  /** Bấm vào ảnh để xin URL mới (trình soạn). Tắt ở thẻ lật: cú chạm phải để thẻ lật, không phải để tải lại ảnh. */
  reloadable?: boolean;
}

/**
 * Ảnh của mục/bộ học qua URL KÝ (`GET /assets/:id/url`, sống ≤ 60 s; quyền theo bộ HIỆN TẠI — be.md p4-01 §13.12).
 *
 * `cachePolicy="none"`: mỗi lần lấy URL là một chuỗi khác nên cache đĩa vừa vô ích vừa để ảnh riêng tư lại trên máy
 * (`Thumbnail` ghi rõ cho URL ký có hạn). URL hết hạn giữa chừng thì `Thumbnail` rơi về ô giữ chỗ — ở trình soạn bấm vào
 * ảnh để tải lại; không tự thử lại vòng lặp vì ảnh hỏng thật (đã bị xoá) sẽ chớp mãi.
 */
export function StudyAssetImage({
  alt,
  aspect = 'banner-slim',
  assetId,
  className,
  reloadable = false,
}: StudyAssetImageProps) {
  const { data, isPending, refetch } = useAssetUrl(assetId);

  if (isPending) return <Skeleton className="h-32 rounded-sm" />;

  const image = (
    <Thumbnail
      alt={alt}
      aspect={aspect}
      cachePolicy="none"
      className={className}
      source={data ? { uri: data.url } : undefined}
    />
  );
  if (!reloadable) return image;

  return (
    <Pressable
      accessibilityHint="Chạm để tải lại ảnh nếu không hiện"
      accessibilityLabel={alt}
      accessibilityRole="imagebutton"
      className="active:opacity-80"
      onPress={() => void refetch()}
    >
      {image}
    </Pressable>
  );
}
