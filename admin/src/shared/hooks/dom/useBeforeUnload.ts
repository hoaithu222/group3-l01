/**
 * @file useBeforeUnload.ts
 * @description Cảnh báo rời/tải lại trang khi đang có tác vụ dở (vd upload).
 * Khi `enabled` = true → đăng ký `beforeunload`, trình duyệt hiện hộp thoại xác
 * nhận "Rời khỏi trang?" mặc định (message custom bị trình duyệt bỏ qua).
 */

import { useEffect } from 'react';

export const useBeforeUnload = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Bắt buộc set returnValue để Chrome/Firefox kích hoạt hộp thoại xác nhận.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);
};
