/**
 * useFullscreen — bọc Fullscreen API cho 1 element.
 *
 * Dùng Fullscreen API thay vì `fixed inset-0` vì trình duyệt nhấc element ra khỏi
 * luồng layout → KHÔNG bị `clip-path`/`overflow` của cha cắt (lỗi đã gặp với
 * `HudFrame` notch). State đồng bộ qua `fullscreenchange` nên user bấm ESC vẫn đúng.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react';

/** @param ref - element sẽ phóng to; caller tự tạo để gắn vào JSX. */
export function useFullscreen<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      // Bị từ chối (ngoài user-gesture / policy chặn) → nuốt lỗi, giữ nguyên UI.
      void el.requestFullscreen().catch(() => undefined);
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
