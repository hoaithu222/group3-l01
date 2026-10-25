import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { hapticSelection } from '@/shared/utils/haptics';
import { twMergeConfig } from '@/shared/utils/style/cn';
import { useThemeStore, type ThemePreference } from '@/shell/store/slices/theme';

import { ThemePreview } from './ThemePreview';

const OPTIONS: { hint: string; label: string; spoken: string; value: ThemePreference }[] = [
  { hint: 'Luôn dùng giao diện sáng', label: 'Sáng', spoken: 'Sáng', value: 'light' },
  { hint: 'Luôn dùng giao diện tối', label: 'Tối', spoken: 'Tối', value: 'dark' },
  {
    hint: 'Đổi theo cài đặt sáng hoặc tối của máy',
    label: 'Hệ thống',
    spoken: 'Theo hệ thống',
    value: 'system',
  },
];

/**
 * Vòng chọn + viền đổi MÀU khi chọn; viền luôn `border-medium` để chọn qua lại không làm thẻ nhích 0.5dp. Vòng radio có
 * chấm đặc (cùng mẫu `Radio`) nên trạng thái chọn không chỉ là màu viền.
 */
const themeCard = tv(
  {
    slots: {
      pressable: 'flex-1',
      root: 'flex-1 items-center gap-xs rounded-sm border-medium bg-bg-1 p-xs',
      label: 'text-label-md font-semibold text-fg-1',
      ring: 'size-5 items-center justify-center rounded-full border-medium bg-bg-1',
      dot: 'size-3 rounded-full bg-action-base',
    },
    variants: {
      selected: {
        true: { root: 'border-border-brand', ring: 'border-action-base' },
        false: { root: 'border-border-1', ring: 'border-border-brand-subtle' },
      },
      pressed: { true: { root: 'opacity-70' } },
    },
    defaultVariants: { pressed: false, selected: false },
  },
  { twMergeConfig },
);

/**
 * "Giao diện": ba thẻ chọn NGANG (Sáng · Tối · Hệ thống), mỗi thẻ có hình xem trước thu nhỏ + nhãn + vòng chọn.
 *
 * ⚠️ Bộ icon của repo KHÔNG có mặt trời / mặt trăng (đã tra `assets/icons/system`: chỉ có `vibrate-mode`, `flash`…), mà
 * luật của base là ⛔ đừng tự vẽ icon và đừng lấy tên gần đúng — nên "hình ảnh" ở đây là bản xem trước tự vẽ bằng `View`
 * (xem `ThemePreview`), không phải icon.
 *
 * Bọc `radiogroup` + mỗi thẻ `radio` (`selected`): trình đọc màn hình đọc "Sáng, nút chọn, đã chọn", kèm gợi ý. Nhãn hiện
 * "Hệ thống" cho gọn (ba thẻ ngang ~108dp mỗi thẻ), nhưng tên đọc lên vẫn là "Theo hệ thống".
 */
export function ThemeModePicker() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <View
      accessibilityLabel="Chế độ hiển thị"
      accessibilityRole="radiogroup"
      className="flex-row gap-xs"
    >
      {OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          accessibilityHint={option.hint}
          accessibilityLabel={option.spoken}
          accessibilityRole="radio"
          accessibilityState={{ selected: preference === option.value }}
          className={themeCard().pressable()}
          onPress={() => {
            if (preference === option.value) return;
            hapticSelection();
            setPreference(option.value);
          }}
        >
          {({ pressed }) => {
            const selected = preference === option.value;
            const styles = themeCard({ pressed, selected });

            return (
              <View className={styles.root()}>
                <ThemePreview mode={option.value} />
                <Text className={styles.label()}>{option.label}</Text>
                <View className={styles.ring()}>
                  {selected ? <View className={styles.dot()} /> : null}
                </View>
              </View>
            );
          }}
        </Pressable>
      ))}
    </View>
  );
}
