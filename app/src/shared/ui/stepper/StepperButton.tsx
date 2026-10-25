import { Pressable } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { HIT_SLOP } from './stepper.styles';

export interface StepperButtonProps {
  className: string;
  /** `true` = đã chạm biên (min/max) hoặc cả khối bị khoá. */
  disabled: boolean;
  /** Nhãn cho trình đọc màn hình, dạng "Giảm số lượng". */
  label: string;
  /** ⛔ Bộ icon của ngân hàng KHÔNG có `plus`/`remove` — chỉ `add` và `minus`. */
  name: 'add' | 'minus';
  onPress: () => void;
}

/**
 * Một nút `−` / `+` của `Stepper`.
 *
 * Tách khỏi `Stepper.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`) và vì đúng khối này được dựng HAI lần trong cùng
 * một khối tăng/giảm — cùng khuôn với `input/InputSecureToggle.tsx`.
 */
export function StepperButton({ className, disabled, label, name, onPress }: StepperButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      /**
       * ⛔ `accessibilityState` là dấu hiệu DUY NHẤT mà trình đọc màn hình có:
       * nó không nhìn thấy màu xám của biểu tượng. Thiếu khoá này thì người dùng
       * khiếm thị bấm `−` ở mức tối thiểu, không có gì xảy ra, không có gì được
       * xướng lên, và họ kết luận app treo.
       */
      accessibilityState={{ disabled }}
      className={className}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
    >
      {/* Màu là dấu hiệu THỨ HAI, đi kèm `accessibilityState` chứ không thay thế
          nó. `action-disabled-fg` là bậc đã đo tương phản của cặp khoá — bản vẽ
          dùng `Grays/Gray 2` #AEAEB2, nhưng thang xám KHÔNG đảo theo chế độ tối
          nên đặt thẳng vào là nút khoá ở chế độ tối sáng hơn nút còn dùng được. */}
      <Icon color={disabled ? 'action-disabled-fg' : 'fg-1'} name={name} size="md" />
    </Pressable>
  );
}
