/**
 * @file useClearRowSelectionOnOutsideClick.ts
 * @description Bấm ra ngoài dòng dữ liệu → bỏ chọn dòng trong bảng cây.
 */
import { useEffect } from 'react';

import {
  KEEP_ROW_SELECTION_SELECTOR,
  OPEN_DIALOG_SELECTOR,
} from '@/shared/constants/row-selection.constants';

import { useEventCallback } from '../state/useEventCallback';

/**
 * Nghe ở cấp `document`: cú bấm nào KHÔNG rơi vào dòng dữ liệu (và không thuộc vùng
 * giữ chọn — xem `KEEP_ROW_SELECTION_SELECTOR`) thì gọi `onClear`.
 *
 * Vì sao phải bắt ở `document` chứ không chỉ trong ruột bảng: vị trí đẻ dòng mới của
 * "Thêm nhóm" đọc thẳng dòng đang chọn, nên phải bỏ chọn được mới thêm nhóm ở cấp
 * GỐC. Bảng dài kín màn hình thì trong bảng KHÔNG còn nền trống nào để bấm
 * (user báo 2026-08-18).
 *
 * Dùng `mousedown` (không phải `click`) để bỏ chọn xong trước khi tiêu điểm đổi chỗ.
 *
 * @param enabled Đang có dòng được chọn — không có thì khỏi gắn listener.
 */
export const useClearRowSelectionOnOutsideClick = (enabled: boolean, onClear: () => void) => {
  const clear = useEventCallback(onClear);

  useEffect(() => {
    if (!enabled) return;

    const handle = (e: MouseEvent) => {
      // Modal đang mở → treo luật: lớp phủ Radix không khớp selector nào ở trên,
      // bấm nó để đóng modal sẽ bị hiểu nhầm thành "bỏ chọn".
      if (document.querySelector(OPEN_DIALOG_SELECTOR)) return;
      const el = e.target as HTMLElement | null;
      // Target đã rời DOM (dòng vừa bị xoá) → không còn gì để suy ra, bỏ qua.
      if (!el?.isConnected) return;
      if (el.closest(KEEP_ROW_SELECTION_SELECTOR)) return;
      clear();
    };

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [enabled, clear]);
};
