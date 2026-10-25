import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { ShopItem } from '../api/coins.types';
import { emojisOf, frameOf, themeOf } from '../utils/shop-data';
import { AvatarFramePreview } from './AvatarFramePreview';

/**
 * Hình xem trước của vật phẩm, dựng từ `ShopItem.data` theo `kind` (BE P0 chưa có ảnh vật phẩm — `assetId` luôn `null`, cần `AssetScope SHOP_ITEM`):
 *  · `AVATAR_FRAME` — khung quanh avatar của tôi · `PROFILE_THEME` — hai mẫu màu (chính · nhấn) · `EMOJI_PACK` — vài emoji đầu của gói.
 * Dữ liệu thiếu/hỏng ⇒ hình rỗng nhưng KHÔNG sập (thẻ vẫn có tên + giá). Hình thuần trang trí, ẩn khỏi trình đọc màn hình (nghĩa ở tên + loại vật phẩm).
 * ⚠️ Màu mẫu là dữ liệu của vật phẩm (không phải token giao diện) nên đi qua `style`; viền `border-1` để mẫu trắng không tan vào nền thẻ.
 */
export function ItemPreview({
  compact = false,
  item,
}: {
  /** Khung nhỏ (hàng kho đồ) thay vì khung cao 96 của thẻ/tấm mua. */
  compact?: boolean;
  item: Pick<ShopItem, 'data' | 'kind'>;
}) {
  let content: ReactNode;
  if (item.kind === 'AVATAR_FRAME') {
    content = <AvatarFramePreview frame={frameOf(item.data)} />;
  } else if (item.kind === 'PROFILE_THEME') {
    const theme = themeOf(item.data);
    const swatch = compact
      ? 'size-3xl rounded-xs border-hairline border-border-1'
      : 'size-4xl rounded-sm border-hairline border-border-1';
    content = theme ? (
      <View className="flex-row gap-xs">
        <View className={swatch} style={{ backgroundColor: theme.primary }} />
        <View className={swatch} style={{ backgroundColor: theme.accent }} />
      </View>
    ) : null;
  } else {
    // Khử trùng để `key={emoji}` ổn định (gói lặp một emoji thì hình xem trước không cần hiện hai lần).
    const emojis = [...new Set(emojisOf(item.data, compact ? 3 : 6))];
    content =
      emojis.length > 0 ? (
        <View className="flex-row flex-wrap items-center justify-center gap-xs px-xs">
          {emojis.map((emoji) => (
            <Text key={emoji} className="text-header-sm">
              {emoji}
            </Text>
          ))}
        </View>
      ) : null;
  }

  return (
    <View
      accessibilityElementsHidden
      className={
        compact
          ? 'h-16 w-20 items-center justify-center rounded-sm bg-bg-2'
          : 'h-24 items-center justify-center rounded-sm bg-bg-2'
      }
      importantForAccessibility="no-hide-descendants"
    >
      {content}
    </View>
  );
}
