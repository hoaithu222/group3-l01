import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { MEDIA_ASPECT_RATIO } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { COVER_INK, COVER_SURFACE, coverToneFor } from './cover-tone';

export interface SetCoverBannerProps {
  /** `coverAssetId` của bộ — xin URL bản GỐC (nét hơn ô thumbnail nhỏ của danh sách). */
  assetId: string | null;
  className?: string;
  /** `coverThumbUrl` — hiện ngay trong lúc URL bản gốc còn đang xin, và làm phương án cuối nếu lần xin lỗi. */
  thumbUrl: string | null;
  title: string;
}

/**
 * Ảnh bìa ngang ở đầu trang tổng quan bộ. Không có ảnh (hoặc ảnh chưa/không tải được) ⇒ mảng màu suy từ tiêu đề với "huy hiệu"
 * tròn ở giữa — cùng ngôn ngữ với `SetCoverThumb` để bìa trong danh sách và bìa ở đầu trang nhìn ra cùng một bộ.
 *
 * ⚠️ Cùng cách xếp LỚP như `SetCoverThumb`: ô màu nằm dưới, ảnh phủ trên — `expo-image` hỏng thì vẽ trong suốt và mảng màu tự lộ ra.
 * `aspectRatio` đặt bằng `style` (số, không phải class `aspect-[…]`) và lấy từ `MEDIA_ASPECT_RATIO['banner-slim']` của bộ chung ⇒ khung
 * chiếm đúng chỗ từ khung hình đầu, ảnh tải xong không làm trang nhảy. ⛔ Không truyền bề rộng cứng: khối co theo cột chứa nó
 * (cả trang ở điện thoại, nửa trang ở máy tính bảng).
 *
 * URL bản gốc ký ngắn hạn (`useAssetUrl`, ≤ 60 s) ⇒ `cachePolicy="memory"`, không để ảnh riêng tư lại trên đĩa. Chỉ TRANG TRÍ (tiêu đề
 * đã là chữ ngay dưới) nên ẩn khỏi trình đọc màn hình.
 */
export function SetCoverBanner({ assetId, className, thumbUrl, title }: SetCoverBannerProps) {
  const asset = useAssetUrl(assetId ?? undefined);
  const uri = asset.data?.url ?? thumbUrl ?? undefined;
  const source = useMemo(() => (uri ? { uri } : undefined), [uri]);
  const tone = coverToneFor(title);

  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'w-full items-center justify-center overflow-hidden',
        COVER_SURFACE[tone],
        className,
      )}
      importantForAccessibility="no-hide-descendants"
      style={{ aspectRatio: MEDIA_ASPECT_RATIO['banner-slim'] }}
    >
      <View className="size-6xl items-center justify-center rounded-full bg-bg-1">
        <Icon color={COVER_INK[tone]} name="book" size={32} variant="twotone" />
      </View>
      {source ? (
        <Image
          cachePolicy="memory"
          contentFit="cover"
          recyclingKey={uri}
          source={source}
          style={StyleSheet.absoluteFill}
          transition={200}
        />
      ) : null}
    </View>
  );
}
