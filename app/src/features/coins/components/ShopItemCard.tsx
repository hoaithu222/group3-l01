import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { PressableScale } from '@/shared/ui/motion';

import type { ShopListing } from '../api/coins.types';
import { SHOP_KIND_LABELS } from '../constants/coins.constants';
import { formatCoins } from '../utils/coin-format';
import { ItemPreview } from './ItemPreview';

export interface ShopItemCardProps {
  item: ShopListing;
  onPress: (item: ShopListing) => void;
}

/**
 * Thẻ vật phẩm trong lưới cửa hàng (app.md p7-02 §3): hình xem trước, tên, loại, và GIÁ hoặc "Đã có"/"Đang dùng" — bằng chữ + icon, không chỉ màu.
 * Cả thẻ là một nút mở tấm xác nhận (vật phẩm đã có thì tấm nói "bạn đã sở hữu"). Giá luôn kèm chữ "xu" ("120 xu", không chỉ icon); chữ đứng cạnh icon
 * trong `flex-row` nên `flex-1` để giá dài không đẩy icon ra ngoài.
 *
 * ✅ `PressableScale` (co nhẹ khi nhấn — thẻ độc lập có bo góc) + `fill`: thẻ cao BẰNG ô lưới, nên hai thẻ một hàng cao đều
 * dù tên một dòng hay hai dòng; dòng giá/trạng thái dồn xuống đáy (`mt-auto`) để các giá thẳng hàng.
 * ⚠️ Tên nút = ĐÚNG tên vật phẩm (test + trình đọc màn hình tìm theo tên); giá/trạng thái đi qua `accessibilityValue`.
 */
export function ShopItemCard({ item, onPress }: ShopItemCardProps) {
  const status = item.owned ? (item.equipped ? 'Đang dùng' : 'Đã có') : null;

  return (
    <PressableScale
      accessibilityLabel={item.name}
      accessibilityRole="button"
      accessibilityValue={{
        text: `${SHOP_KIND_LABELS[item.kind]}, ${status ?? formatCoins(item.price)}`,
      }}
      className="flex-1"
      fill
      onPress={() => onPress(item)}
    >
      <Card className="flex-1 gap-xs" media={<ItemPreview item={item} />} title={item.name}>
        <Text className="text-caption-lg text-fg-2">{SHOP_KIND_LABELS[item.kind]}</Text>
        {status ? (
          <Badge
            className="mt-auto self-start"
            label={status}
            variant={item.equipped ? 'success' : 'neutral'}
          />
        ) : (
          <View className="mt-auto flex-row items-center gap-3xs">
            <Icon color="action-accent" name="loyalty" size="sm" />
            <Text className="flex-1 text-label-md font-semibold text-fg-1">
              {formatCoins(item.price)}
            </Text>
          </View>
        )}
      </Card>
    </PressableScale>
  );
}
