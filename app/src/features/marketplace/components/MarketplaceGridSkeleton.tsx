import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

/** Hai hàng × hai ô, CAO BẰNG thẻ thật (bìa 96 + chữ + giá ≈ 256dp) — lưới không nhảy lúc dữ liệu về. */
const ROWS = [0, 1];
const CELLS = [0, 1];

/**
 * Khung xương của lưới chợ — cùng hình dạng `MarketplaceGridRow` (hàng `flex-row gap-sm`, ô `flex-1`) thay cho một đoạn văn xương chung
 * chung: người dùng thấy ngay "sắp có một lưới thẻ", không phải một màn chữ.
 */
export function MarketplaceGridSkeleton() {
  return (
    <View className="gap-sm">
      {ROWS.map((row) => (
        <View key={row} className="flex-row gap-sm">
          {CELLS.map((cell) => (
            <View key={cell} className="flex-1">
              <Skeleton className="h-64 rounded-md" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
