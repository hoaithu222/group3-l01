import { View } from 'react-native';

import type { Listing } from '../api/marketplace.types';
import { MARKETPLACE_GRID_COLUMNS } from '../constants/marketplace.constants';
import { MarketplaceItemCard } from './MarketplaceItemCard';

export interface MarketplaceGridRowProps {
  listings: readonly Listing[];
  onOpen: (listing: Listing) => void;
}

/**
 * Một HÀNG của lưới chợ (một phần tử của `FlatList`). Mỗi ô `flex-1` trong `flex-row gap-sm` — ⛔ không bề rộng cứng (`w-[165px]` tràn ở
 * máy 320dp, lọt thỏm ở máy tính bảng). Hàng cuối thiếu ô thì đệm ô trống `flex-1` để ô lẻ KHÔNG giãn ra gấp đôi (xem `chunkRows`).
 */
export function MarketplaceGridRow({ listings, onOpen }: MarketplaceGridRowProps) {
  return (
    <View className="flex-row gap-sm">
      {listings.map((listing) => (
        <View key={listing.id} className="flex-1">
          <MarketplaceItemCard listing={listing} onPress={() => onOpen(listing)} />
        </View>
      ))}
      {Array.from({ length: MARKETPLACE_GRID_COLUMNS - listings.length }, (_, slot) => (
        <View key={`empty-${String(slot)}`} className="flex-1" />
      ))}
    </View>
  );
}
