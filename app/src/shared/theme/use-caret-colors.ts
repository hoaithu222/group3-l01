import { useThemeColors } from './use-theme-colors';

/**
 * Màu CON TRỎ + vùng bôi chọn của mọi `TextInput`, theo token thương hiệu.
 *
 * ⚠️ Vì sao cần: Android tự tô con trỏ, tay cầm bôi chọn và vùng bôi bằng màu `colorAccent` của hệ điều hành —
 * teal/xanh lục mặc định — nên trong ô nhập viền tím (`border-brand`) có một con trỏ xanh lục lạc tông (đo trên máy
 * ảo). Ba prop này là prop NATIVE thô, không nhận `className`, nên phải lấy màu đã phân giải qua hook (cùng bẫy với
 * `placeholderTextColor`).
 *
 *   · `cursorColor` / `selectionHandleColor` — `action-base` (tím đậm ở sáng, tím nhạt ở tối: luôn nổi trên `bg-input`);
 *   · `selectionColor` — `action-tint-strong`: nền vùng bôi đủ đậm để thấy nhưng chữ (`fg-1`) vẫn đọc được trên nó.
 *
 * Rải TRƯỚC `{...rest}` để nơi gọi ghi đè được. iOS bỏ qua `cursorColor`/`selectionHandleColor` (chỉ nhận
 * `selectionColor`) — vô hại.
 */
export function useCaretColors(): {
  cursorColor: string;
  selectionColor: string;
  selectionHandleColor: string;
} {
  const colors = useThemeColors();
  return {
    cursorColor: colors['action-base'],
    selectionColor: colors['action-tint-strong'],
    selectionHandleColor: colors['action-base'],
  };
}
