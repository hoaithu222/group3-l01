import { useState } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

interface Selection {
  start: number;
  end: number;
}

/**
 * Con trỏ của ô soạn: vị trí native báo LẦN CUỐI (`selection`) + "con trỏ ép" một nhịp (`forcedSelection`) khi JS phải tự đặt con trỏ —
 * chọn gợi ý nhắc tên, chèn emoji, Backspace xoá nguyên chip. Tách khỏi `useComposerText` (trần 150 dòng) vì đây là một việc riêng.
 *
 * ⚠️ `forcedSelection` chỉ sống MỘT nhịp: native báo đã đặt xong đúng vị trí đó thì thả ngay, không giành quyền với bộ gõ (Telex/VNI).
 */
export function useComposerSelection(initialCursor: number) {
  const [selection, setSelection] = useState<Selection>({ start: initialCursor, end: initialCursor });
  const [forcedSelection, setForcedSelection] = useState<Selection>();

  const changeSelection = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const next = event.nativeEvent.selection;
    setSelection(next);
    // Native đã đặt xong con trỏ ép → thả `selection` để không giành quyền với bộ gõ.
    if (
      forcedSelection &&
      next.start === forcedSelection.start &&
      next.end === forcedSelection.end
    ) {
      setForcedSelection(undefined);
    }
  };

  /** Đặt con trỏ từ JS (không bôi đen). */
  const forceCursor = (position: number) => {
    const cursor = { start: position, end: position };
    setSelection(cursor);
    setForcedSelection(cursor);
  };

  /** Ô về rỗng (đã gửi): con trỏ về đầu, không để vị trí cũ (vd 50) làm mốc cho lần chèn emoji kế tiếp. */
  const resetCursor = () => setSelection({ start: 0, end: 0 });

  return { selection, forcedSelection, changeSelection, forceCursor, resetCursor };
}
