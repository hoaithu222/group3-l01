import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useState } from 'react';
import { View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileSize, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

/**
 * ⛔ `Image` của `expo-image` không nằm trong danh sách NativeWind hiểu `className`.
 * ⚠️ Vì sao KHÔNG dùng `Thumbnail` chung (`@/shared/ui/card`): nó không cho chọn
 * `cachePolicy`, mà URL thumbnail của kho tài liệu là URL KÝ ≤ 60 s — mỗi lần một
 * URL khác nên cache đĩa mặc định vừa vô ích vừa để lại ảnh riêng tư trên máy
 * (p0-05 app.md §4 "cachePolicy: 'none' cho URL riêng tư").
 */
const ThumbImage = cssInterop(Image, { className: 'style' });

export interface ResourceThumbProps {
  /** Tỉ lệ rộng/cao đặt bằng `style` (RN nhận SỐ, không nhận phân số CSS) — khung chiếm đúng chỗ từ khung hình đầu nên ảnh tải xong không làm bố cục nhảy. */
  aspectRatio?: number;
  className?: string;
  icon: IconName;
  /** Khoá tái chế ô của FlashList — bắt buộc khi có ảnh, không thì ảnh cũ chớp lên ô mới. */
  recyclingKey: string;
  thumbnailUrl?: string | null;
  /**
   * Cỡ ô icon khi KHÔNG có ảnh: `md` (40, mặc định) lấp đúng khung 40 của hàng danh sách; `xl` (64) nằm giữa bìa 4:3
   * của ô lưới.
   */
  tileSize?: IconTileSize;
  /** Tông ô icon theo loại tệp (`ResourceTypeMeta.tone`). Mặc định `neutral`. */
  tone?: IconTileTone;
}

/**
 * Ô đại diện của tệp/thư mục: thumbnail ảnh nếu có, không thì `IconTile` có TÔNG theo loại (thư mục vàng nâu, ảnh xanh
 * lá, video xanh dương…) — lưới/danh sách nhìn ra loại tệp nhanh hơn một hàng icon xám giống hệt nhau.
 * Lỗi tải thumbnail (URL hết hạn/mất mạng — `expo-image` vẽ TRONG SUỐT im lặng)
 * ⇒ nhớ CHÍNH URL đã hỏng và quay về icon, cùng cách `Thumbnail`/`Avatar` làm.
 * Thuần trang trí (loại tệp đã có chữ bên cạnh) nên ẩn khỏi trình đọc màn hình.
 *
 * ⚠️ Hàng danh sách đặt khung `size-4xl rounded-sm` — ĐÚNG cỡ + bo của `IconTile md`, để hàng có ảnh và hàng không ảnh
 * thẳng cột chữ với nhau.
 */
export function ResourceThumb({
  aspectRatio,
  className,
  icon,
  recyclingKey,
  thumbnailUrl,
  tileSize = 'md',
  tone = 'neutral',
}: ResourceThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(thumbnailUrl) && thumbnailUrl !== failedUrl;

  return (
    <View
      accessibilityElementsHidden
      className={cn('items-center justify-center overflow-hidden rounded-xs bg-bg-2', className)}
      importantForAccessibility="no-hide-descendants"
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {showImage ? (
        <ThumbImage
          cachePolicy="none"
          className="absolute inset-0"
          contentFit="cover"
          recyclingKey={recyclingKey}
          source={{ uri: thumbnailUrl as string }}
          onError={() => setFailedUrl(thumbnailUrl ?? null)}
        />
      ) : (
        <IconTile name={icon} size={tileSize} tone={tone} />
      )}
    </View>
  );
}
