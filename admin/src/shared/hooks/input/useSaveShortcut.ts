/**
 * @file useSaveShortcut.ts
 * @description Bind `Ctrl+S` / `Cmd+S` để LƯU NGAY màn hình đang mở.
 *
 * ⛔ Phím này luôn bị NUỐT khi hook đang bật, kể cả lúc không có gì để lưu: mặc
 * định của trình duyệt là mở hộp thoại "Lưu trang" — thứ vô nghĩa với SPA và làm
 * người dùng tưởng mình vừa lưu nhầm chỗ. Tách `enabled` (có bind hay không) khỏi
 * `canSave` (có gọi `onSave` hay không) chính là để giữ được phần nuốt phím đó.
 *
 * KHÔNG chặn khi con trỏ đang ở trong ô nhập: `Ctrl+S` là phản xạ "lưu tất" — mọi
 * ứng dụng soạn thảo đều lưu được giữa lúc gõ dở, chặn mới là bất ngờ.
 */

import { useEffect } from 'react';
import { useEventCallback } from '../state/useEventCallback';

interface UseSaveShortcutOptions {
  /** `false` → không bind gì cả (không có quyền sửa, panel đóng…). Mặc định `true`. */
  enabled?: boolean;
  /** `false` → vẫn nuốt phím nhưng KHÔNG gọi `onSave` (không có thay đổi / đang lưu). */
  canSave?: boolean;
}

export function useSaveShortcut(
  onSave: () => void,
  { enabled = true, canSave = true }: UseSaveShortcutOptions = {},
): void {
  // Identity ổn định → đổi handler không phải gỡ/bind lại listener.
  const save = useEventCallback(onSave);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S TRƠN. Có thêm Alt/Shift là tổ hợp khác (vd Ctrl+Shift+S =
      // "lưu thành..." của trình duyệt) — trả lại cho hệ thống.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;

      // ⛔ Nhận diện bằng `code` (VỊ TRÍ phím), KHÔNG phải `key` (KÝ TỰ sinh ra):
      // đang bật bộ gõ tiếng Việt thì `key` có thể là `'Process'`/`'Unidentified'`
      // chứ không phải `'s'`, và phím tắt im lặng không chạy. Cùng lý do với
      // `useTvEscapeHatch` (dùng `code === 'KeyT'`). Vẫn dò `key` để đỡ bàn phím
      // lạ không phát `code`.
      if (e.code !== 'KeyS' && e.key !== 's' && e.key !== 'S') return;

      e.preventDefault();
      if (canSave) save();
    };

    // ⛔ CAPTURE: bắt trên đường đi XUỐNG, trước mọi handler bên trong. Bắt ở pha
    // nổi bọt thì một `stopPropagation()` bất kỳ trong bảng/modal/popup là phím
    // tắt chết lặng — mà đó đúng là chỗ người dùng đang gõ khi muốn lưu.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, canSave, save]);
}
