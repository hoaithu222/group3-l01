import { Pressable, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { LocationType } from '../../api/o2o.types';
import { LOCATION_TYPE_ICON, LOCATION_TYPE_LABEL } from '../../constants/o2o.constants';

export interface MapPinProps {
  name: string;
  type: LocationType;
  selected: boolean;
  onPress: () => void;
}

/**
 * Ghim trên bản đồ. Loại địa điểm phân biệt bằng ICON (không chỉ màu — app.md §7); tên đọc kèm loại cho trình đọc màn hình.
 * Đang chọn: nền ĐẶC `action-base` + icon `action-fg` (cặp *-fg cùng họ: ở chế độ tối nền nút SÁNG và chữ/icon TỐI, viết cứng màu trắng là biến mất).
 * Vùng chạm: vòng 40dp + `hitSlop` 4 mỗi phía = 48dp (≥ 44dp).
 */
export function MapPin({ name, type, selected, onPress }: MapPinProps) {
  return (
    <Pressable
      accessibilityLabel={`${name}, ${LOCATION_TYPE_LABEL[type]}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={onPress}
    >
      <View
        className={
          selected
            ? 'size-4xl items-center justify-center rounded-full border-thick border-border-white bg-action-base'
            : 'size-4xl items-center justify-center rounded-full border-hairline border-border-brand bg-surface-primary'
        }
      >
        <Icon
          color={selected ? 'action-fg' : 'fg-brand'}
          name={LOCATION_TYPE_ICON[type]}
          size="sm"
          variant="solid"
        />
      </View>
    </Pressable>
  );
}
