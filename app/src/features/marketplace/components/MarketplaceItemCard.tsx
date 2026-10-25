import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { Listing } from '../api/marketplace.types';
import { CONTENT_TYPE_VISUAL } from '../constants/marketplace.constants';
import { CONTENT_TYPE_LABELS, formatCoins, formatSales } from '../utils/listing-format';

export interface MarketplaceItemCardProps {
  listing: Listing;
  onPress: () => void;
}

/**
 * Ô một tin niêm yết trong LƯỚI chợ (app.md §2 "MarketplaceItemCard"): bìa theo loại nội dung · tiêu đề · loại · người bán · giá · lượt mua.
 *
 * ── Bìa ─────────────────────────────────────────────────────────────────────
 * BE chưa có ảnh bìa cho tin (`Listing` không có trường ảnh) nên bìa là ô icon có tông theo LOẠI (`CONTENT_TYPE_VISUAL`) trên nền `bg-2` —
 * nhìn lướt lưới là phân biệt bộ học/tài liệu. Bìa thuần trang trí (nghĩa đã nằm ở huy hiệu loại) nên ẩn khỏi trình đọc màn hình.
 *
 * ── Bố cục ──────────────────────────────────────────────────────────────────
 * `flex-1` để hai ô cùng hàng cao bằng nhau (hàng `flex-row` kéo giãn con); khối giá `mt-auto` dạt xuống đáy thẻ nên giá của hai ô luôn
 * thẳng hàng dù tiêu đề dài ngắn khác nhau. ⛔ Tiêu đề không `numberOfLines` (cùng luật `MediaCard`): cắt "Từ vựng TOEIC 6…" là giấu mất
 * thứ người mua cần đọc. Giá luôn kèm chữ "xu" cạnh icon `loyalty` — cùng cách `ShopItemCard` của phân hệ xu.
 *
 * Trợ năng: `Card` có `title` chuỗi + `onPress` ⇒ tiêu đề mang vai `button`, các dòng còn lại đọc riêng từng ý.
 */
export function MarketplaceItemCard({ listing, onPress }: MarketplaceItemCardProps) {
  const visual = CONTENT_TYPE_VISUAL[listing.contentType];

  return (
    <Card
      className="flex-1 gap-xs"
      media={
        <View
          accessibilityElementsHidden
          className="h-24 items-center justify-center rounded-sm bg-bg-2"
          importantForAccessibility="no-hide-descendants"
        >
          <IconTile name={visual.icon} size="xl" tone={visual.tone} />
        </View>
      }
      title={listing.title}
      onPress={onPress}
    >
      <Badge
        className="self-start"
        label={CONTENT_TYPE_LABELS[listing.contentType]}
        size="sm"
        variant="neutral"
      />
      {listing.sellerName ? (
        <View className="flex-row items-center gap-2xs">
          {/* BE chỉ trả TÊN người bán (không có ảnh) — `Avatar` dựng chữ viết tắt từ tên. Ẩn khỏi trình đọc màn hình (hai cờ
              iOS · Android): `Avatar` có `name` tự đọc tên, mà tên đã có ở dòng chữ ngay cạnh. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Avatar name={listing.sellerName} size="xs" />
          </View>
          <Text className="flex-1 text-caption-lg text-fg-2" numberOfLines={1}>
            {listing.sellerName}
          </Text>
        </View>
      ) : null}
      <View className="mt-auto gap-3xs">
        <View className="flex-row items-center gap-3xs">
          <Icon color="action-accent" name="loyalty" size="sm" />
          <Text className="flex-1 text-label-md font-semibold text-fg-1">
            {formatCoins(listing.price)}
          </Text>
        </View>
        <Text className="text-caption-sm text-fg-2">{formatSales(listing.sales)}</Text>
      </View>
    </Card>
  );
}
