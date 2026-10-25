import { Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';

import type { InputVariants } from './input.styles';

/** Tông của dòng chữ — dùng chung cho chú thích phải nhãn và thông báo dưới ô. */
export type InputTone = NonNullable<InputVariants['tone']>;

/**
 * ⛔ Biểu tượng đi KÈM màu, không thay thế màu.
 *
 * Luật ở `src/shared/ui/AGENTS.md`: "luôn kèm biểu tượng — đừng để MÀU là dấu
 * hiệu duy nhất". Bảng màu của ngân hàng có `warning` chỉ 4.06:1 trên nền
 * trắng, và người mù màu đỏ-lục không phân biệt được dòng lỗi với dòng gợi ý
 * nếu hai dòng chỉ khác nhau ở màu chữ.
 *
 * Tên icon tra từ `assets/icons/system` — bộ của ngân hàng đặt tên theo lối
 * riêng (`alert-warning` chứ không phải `warning`, `checkmark-circle` chứ không
 * phải `check`), gõ theo thói quen phương Tây là `tsc` đỏ.
 */
const TONE_ICON: Record<InputTone, { color: ThemeColorKey; name: IconName }> = {
  error: { color: 'error', name: 'alert-warning' },
  hint: { color: 'fg-2', name: 'alert-information' },
  success: { color: 'success', name: 'checkmark-circle' },
};

export interface InputMessageProps {
  /** Lớp của cả HÀNG (`hintRow` hoặc `messageRow` của `inputStyles`). */
  className: string;
  text: string;
  /** Lớp của riêng phần CHỮ (`hint` hoặc `message` của `inputStyles`). */
  textClassName: string;
  tone: InputTone;
}

/**
 * Một dòng `[biểu tượng 16] + khe 4 + [chữ]` — component "Message Text" của
 * Figma (259:97588 / 259:97596), dùng cho cả chú thích phải nhãn lẫn thông báo
 * dưới ô.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng, và vì đúng khối này
 * được dựng ở HAI chỗ trong cùng một ô nhập.
 */
export function InputMessage({ className, text, textClassName, tone }: InputMessageProps) {
  const { color, name } = TONE_ICON[tone];

  return (
    <View className={className}>
      {/* Icon KHÔNG có `label`: nghĩa của nó đã nằm nguyên trong dòng chữ ngay
          bên cạnh. Gắn nhãn vào đây là trình đọc màn hình xướng thừa một tiếng
          "hình ảnh" trước mỗi thông báo. */}
      <Icon color={color} name={name} size="xs" />
      {/* `alert` để trình đọc màn hình xướng NGAY khi lỗi xuất hiện, không đợi
          người dùng chạm lại vào ô. Dòng gợi ý thì không — nó không phải thứ
          cần cắt ngang việc người dùng đang làm. */}
      <Text accessibilityRole={tone === 'error' ? 'alert' : 'text'} className={textClassName}>
        {text}
      </Text>
    </View>
  );
}
