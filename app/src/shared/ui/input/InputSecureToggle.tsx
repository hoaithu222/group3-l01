import { Pressable } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';

export interface InputSecureToggleProps {
  /** Màu nét của biểu tượng — theo `controlInk` của `InputControls`. */
  color: ThemeColorKey;
  disabled: boolean;
  /** `true` = nội dung đang HIỆN, nút mời ẩn đi. */
  revealed: boolean;
  onToggle: () => void;
}

/**
 * Nút con mắt hiện/ẩn mật khẩu trong ô nhập.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), không phải vì dùng lại ở đâu khác.
 */
export function InputSecureToggle({ color, disabled, revealed, onToggle }: InputSecureToggleProps) {
  return (
    <Pressable
      accessibilityLabel={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      /**
       * Nới vùng chạm ra ngoài phần vẽ. Biểu tượng chỉ 24dp, mà ngưỡng chạm dễ
       * trúng tối thiểu là 44dp — dưới mức đó người dùng phải bấm hai ba lần
       * mới trúng, và họ đổ lỗi cho app chứ không cho ngón tay mình.
       */
      hitSlop={12}
      onPress={onToggle}
    >
      {/* ⛔ Bộ icon của ngân hàng, KHÔNG phải `@expo/vector-icons`: nét và bo góc
          của Ionicons lệch hẳn với bản thiết kế, và nó không đổi theo bộ icon mà
          ngân hàng cập nhật (xem `src/shared/ui/AGENTS.md`). */}
      <Icon color={color} name={revealed ? 'hide' : 'view'} size="md" />
    </Pressable>
  );
}
