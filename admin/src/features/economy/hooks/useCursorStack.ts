import { useCallback, useState } from 'react';

interface CursorStack {
  /** Cursor của trang đang xem; `undefined` = trang đầu. */
  cursor: string | undefined;
  hasPrev: boolean;
  /** Sang trang sau với cursor BE trả về (`meta.nextCursor`). */
  push: (next: string) => void;
  pop: () => void;
  /** Về trang đầu — gọi khi đổi bộ lọc (cursor của bộ lọc cũ không dùng được cho bộ lọc mới). */
  reset: () => void;
}

/**
 * Chồng cursor cho danh sách phân trang cursor (sổ cái): phần tử cuối = trang đang xem, rỗng = trang đầu. Cursor không quay ngược được
 * nên "Trang trước" = bỏ cursor cuối. Đổi người dùng thì nơi dùng đặt `key` theo người đó để chồng về rỗng.
 */
export function useCursorStack(): CursorStack {
  const [stack, setStack] = useState<string[]>([]);
  const push = useCallback((next: string) => setStack((s) => [...s, next]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  return { cursor: stack[stack.length - 1], hasPrev: stack.length > 0, push, pop, reset };
}
