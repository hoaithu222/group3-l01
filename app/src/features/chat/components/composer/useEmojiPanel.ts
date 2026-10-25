import { useRef, useState } from 'react';
import { Keyboard, type TextInput } from 'react-native';

/**
 * Trạng thái bảng emoji dưới ô nhập (kiểu Zalo): mở bảng thì HẠ bàn phím, chạm lại ô nhập (hoặc nút bàn phím) thì đóng bảng và
 * bàn phím trở lại. Tách khỏi `ComposerBody` (file đó sát trần 200 dòng) — đây là một máy trạng thái nhỏ tự đủ.
 *
 * ⚠️ Mở bảng phải `blur()` chứ không chỉ `Keyboard.dismiss()`: ô còn focus thì Android mở lại bàn phím ở lần render kế và bảng emoji
 * bị bàn phím đè lên. Con trỏ (`selection`) vẫn nằm trong `useComposerText` nên emoji chèn đúng chỗ dù ô đã mất focus.
 */
export function useEmojiPanel() {
  const inputRef = useRef<TextInput>(null);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (open) {
      // Nút đã đổi thành biểu tượng bàn phím: chạm là quay lại gõ chữ. `focus()` sẽ gọi `onFocus` của ô nhập → `close()`.
      setOpen(false);
      inputRef.current?.focus();
      return;
    }
    inputRef.current?.blur();
    Keyboard.dismiss();
    setOpen(true);
  };

  return { inputRef, open, toggle, close: () => setOpen(false) };
}
