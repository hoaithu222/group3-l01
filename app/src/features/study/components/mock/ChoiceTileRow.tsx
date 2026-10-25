import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { tapHaptic } from '../../utils/mock-haptics';

/**
 * Chọn MỘT trong vài mốc (số câu, thời lượng) bằng ô LỚN có giá trị to + đơn vị nhỏ.
 *
 * ── Vì sao không dùng `Chip role="radio"` (cách cũ) hay `RadioGroup` của bộ chung ────────────────────────────────────
 * `Chip` cao 48dp, một dòng nhãn cỡ thường — không hiện được con số lớn làm điểm nhìn của màn thiết lập; `Radio` là hàng
 * danh sách (chấm tròn + nhãn), không phải ô chọn nhanh trải đều bề ngang. Ô này vẫn giữ nghĩa trợ năng của nhóm radio.
 *
 * Trạng thái không chỉ là màu: ô đang chọn có viền `info` DÀY + dấu tích đặc ở góc; ô còn lại viền mảnh, không dấu.
 */
const tile = tv(
  {
    slots: {
      root: 'min-h-16 items-center justify-center rounded-md border-medium px-xs py-sm',
      value: 'text-header-lg font-bold text-fg-1',
      unit: 'text-label-md font-regular text-fg-2',
    },
    variants: {
      selected: {
        true: { root: 'border-border-info bg-surface-info', unit: 'text-fg-1' },
        false: { root: 'border-border-1 bg-bg-1' },
      },
      pressed: { true: { root: 'bg-surface-info' } },
    },
    defaultVariants: { pressed: false, selected: false },
  },
  { twMergeConfig },
);

export interface ChoiceTileRowProps<T extends number> {
  /** Tên nhóm cho trình đọc màn hình ("Số câu", "Thời lượng"). */
  label: string;
  options: readonly T[];
  /** Đơn vị đứng sau số ("câu", "phút") — nhãn trợ năng của ô là `"<số> <đơn vị>"`. */
  unit: string;
  value: T;
  onChange: (value: T) => void;
}

export function ChoiceTileRow<T extends number>({
  label,
  onChange,
  options,
  unit,
  value,
}: ChoiceTileRowProps<T>) {
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" className="flex-row gap-xs">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityLabel={`${option} ${unit}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            className="flex-1"
            onPress={() => {
              tapHaptic();
              onChange(option);
            }}
          >
            {({ pressed }) => {
              const styles = tile({ pressed: pressed && !selected, selected });
              return (
                <View className={styles.root()}>
                  <Text className={styles.value()} maxFontSizeMultiplier={1.3}>
                    {option}
                    <Text className={styles.unit()}>{` ${unit}`}</Text>
                  </Text>
                  {selected ? (
                    <View className="absolute right-xs top-xs">
                      <Icon color="info" name="checkmark-circle" size={16} variant="solid" />
                    </View>
                  ) : null}
                </View>
              );
            }}
          </Pressable>
        );
      })}
    </View>
  );
}
