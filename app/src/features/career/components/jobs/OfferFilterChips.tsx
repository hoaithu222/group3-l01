import { ScrollView } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { hapticSelection } from '@/shared/utils/haptics';

import { OFFER_GROUPS, type OfferGroup } from '../../utils/offer-format';

export interface OfferFilterChipsProps {
  value: OfferGroup;
  onChange: (group: OfferGroup) => void;
}

/**
 * Lọc hộp thư: Tất cả · Mới · Quan tâm · Đã đóng (app.md §3). `role="radio"` — chọn MỘT nhóm, trình đọc màn hình đọc "đã chọn".
 * ⚠️ `grow-0`: `ScrollView` NGANG của RN mặc định `flexGrow: 1` — nằm trong cột cùng danh sách `flex-1` thì bị kéo cao và chip trôi giữa màn.
 */
export function OfferFilterChips({ onChange, value }: OfferFilterChipsProps) {
  return (
    <ScrollView
      accessibilityRole="radiogroup"
      className="grow-0"
      contentContainerClassName="gap-xs px-md py-xs"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {OFFER_GROUPS.map((group) => (
        <Chip
          key={group.key}
          label={group.label}
          role="radio"
          selected={value === group.key}
          onPress={() => {
            if (value !== group.key) hapticSelection();
            onChange(group.key);
          }}
        />
      ))}
    </ScrollView>
  );
}
