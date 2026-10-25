/**
 * @file useCommandPaletteShortcut.ts
 * @description Bind `Ctrl+K` / `Cmd+K` để MỞ Command Palette từ bất kỳ đâu.
 *
 * Cùng khuôn với `useSaveShortcut.ts`: nhận diện bằng `code` (VỊ TRÍ phím),
 * KHÔNG phải `key` (KÝ TỰ sinh ra) — đang bật bộ gõ tiếng Việt thì `key` có thể
 * là `'Process'`/`'Unidentified'` chứ không phải `'k'`, phím tắt sẽ im lặng
 * không chạy nếu chỉ dò `key`.
 *
 * ⛔ Luôn `preventDefault()` khi khớp tổ hợp — một số trình duyệt/extension
 * dùng Ctrl+K cho ô tìm kiếm riêng của họ (vd Firefox quick-search); không
 * chặn thì cả hai cùng mở, rối UI.
 */
import { useEffect } from 'react';
import { useEventCallback } from '../state/useEventCallback';

interface UseCommandPaletteShortcutOptions {
  /** `false` → không bind gì cả. Mặc định `true`. */
  enabled?: boolean;
}

export function useCommandPaletteShortcut(
  onOpen: () => void,
  { enabled = true }: UseCommandPaletteShortcutOptions = {},
): void {
  // Identity ổn định → đổi handler không phải gỡ/bind lại listener.
  const open = useEventCallback(onOpen);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K TRƠN. Có thêm Alt/Shift là tổ hợp khác — trả lại cho hệ thống.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'KeyK' && e.key !== 'k' && e.key !== 'K') return;

      e.preventDefault();
      open();
    };

    // ⛔ CAPTURE, cùng lý do với `useSaveShortcut`: bắt trước mọi
    // `stopPropagation()` trong modal/bảng/popup — nơi người dùng hay đứng
    // nhất khi cần tìm nhanh sang màn khác.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, open]);
}
