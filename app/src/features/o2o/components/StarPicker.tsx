import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { hapticSelection } from '@/shared/utils/haptics';

export interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
  /** Nhãn của cả nhóm ("Số sao") — trình đọc màn hình đọc kèm "N trên 5". */
  label: string;
  error?: string;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Chọn 1–5 sao. Mỗi sao là MỘT nút 44dp (icon 24 + `hitSlop` 10 mỗi phía) với `accessibilityRole="radio"` — người dùng trình đọc màn hình chọn
 * được từng mức thay vì phải vuốt một thanh trượt. Sao đã chọn: nét ĐẶC (`solid`) + màu `warning`; chưa chọn: nét rỗng — khác nhau ở HÌNH,
 * không chỉ màu. Lỗi hiện ngay dưới hàng sao (không đợi cuộn xuống).
 */
export function StarPicker({ value, onChange, label, error }: StarPickerProps) {
  return (
    <View className="gap-2xs">
      <Text className="text-label-md font-semibold text-fg-1">{label}</Text>
      <View accessibilityLabel={label} accessibilityRole="radiogroup" className="flex-row gap-xs">
        {STARS.map((star) => {
          const on = star <= value;
          return (
            <Pressable
              key={star}
              accessibilityLabel={`${star} trên 5 sao`}
              accessibilityRole="radio"
              accessibilityState={{ checked: star === value }}
              hitSlop={10}
              onPress={() => {
                if (star !== value) hapticSelection();
                onChange(star);
              }}
            >
              <Icon
                color={on ? 'warning' : 'fg-2'}
                name="star"
                size="lg"
                variant={on ? 'solid' : 'linear'}
              />
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="text-caption-lg text-error">{error}</Text> : null}
    </View>
  );
}
