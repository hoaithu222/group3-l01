import { View } from 'react-native';

import type { ShopListing } from '../api/coins.types';
import { ShopItemCard } from './ShopItemCard';

export interface ShopGridProps {
  items: ShopListing[];
  /** Số cột theo cỡ màn (điện thoại 2, máy tính bảng 3–4) — nơi gọi lấy từ `useResponsiveValue`. */
  columns: number;
  onSelect: (item: ShopListing) => void;
}

/** Chia mảng thành các hàng `size` phần tử (hàng cuối có thể thiếu). */
function chunk<T>(list: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < list.length; start += size)
    rows.push(list.slice(start, start + size));
  return rows;
}

/**
 * Lưới vật phẩm — dựng bằng `flex-row` từng hàng thay vì `FlatList numColumns`: danh mục cửa hàng nhỏ (vài chục món), nằm trong vùng cuộn của màn cùng dải tab
 * phía trên, và `numColumns` đổi theo cỡ màn bắt buộc phải đổi `key` cả danh sách (RN báo lỗi nếu đổi tại chỗ). ⚠️ Mỗi ô `flex-1` (KHÔNG bề rộng cứng
 * — 320dp mà cứng `w-[165px]` là tràn), hàng cuối thiếu ô thì đệm ô trống `flex-1` để ô cuối không giãn ra gấp đôi.
 */
export function ShopGrid({ columns, items, onSelect }: ShopGridProps) {
  return (
    <View className="gap-sm">
      {chunk(items, columns).map((row) => (
        <View key={row[0]?.id} className="flex-row gap-sm">
          {row.map((item) => (
            <View key={item.id} className="flex-1">
              <ShopItemCard item={item} onPress={onSelect} />
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, slot) => (
            <View key={`empty-${slot}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
