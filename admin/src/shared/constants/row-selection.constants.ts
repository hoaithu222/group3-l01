/**
 * @file row-selection.constants.ts
 * @description Vùng "giữ dòng đang chọn" cho MỌI bảng cây có con trỏ dòng —
 * Hạng mục và công việc (Kế hoạch · Cài đặt) và Nghiệm thu (Chi tiết hạng mục).
 *
 * Luật: bấm vào BẤT KỲ đâu không phải dòng dữ liệu → bỏ chọn dòng. Bảng dài kín
 * màn hình thì không còn nền trống để bấm, nên phải bắt ở cấp `document` chứ
 * không chỉ trong ruột bảng (user báo 2026-08-18).
 *
 * ⛔ Ở `shared/` chứ KHÔNG ở feature: đây là thứ dễ chép nhầm nhất trong repo —
 * bỏ sót một nhóm selector (portal Radix, `[role="dialog"]`) là bỏ chọn ngay lúc
 * người dùng bấm vào một dropdown đang mở, và lỗi đó im lặng. Hai module đang dùng
 * cùng một bộ; module thứ ba phải import chứ đừng khai lại.
 */

/**
 * Đánh dấu một vùng KHÔNG được coi là "bấm ra ngoài".
 *
 * Gắn lên khối nào thao tác TRÊN dòng đang chọn: toolbar soạn cây, thanh thao tác
 * hàng loạt, panel chi tiết của chính dòng đó. Bỏ chọn khi bấm vào chúng là rút mất
 * đối tượng ngay trước khi lệnh của chúng chạy.
 */
export const KEEP_ROW_SELECTION_ATTR = 'data-keep-row-selection';

/**
 * Bấm trúng thứ khớp selector này thì GIỮ dòng đang chọn. Gồm 4 nhóm:
 *  1. Dòng dữ liệu + header bảng — `onRowClick` / kéo giãn cột / nút cuộn mép lo.
 *  2. Vùng tự đánh dấu (xem `KEEP_ROW_SELECTION_ATTR`).
 *  3. Nội dung Radix bay ra `body` qua portal (dropdown, menu, tooltip, dialog).
 *  4. Mọi control tương tác — nút/ô nhập ở đâu cũng có việc riêng của nó.
 */
export const KEEP_ROW_SELECTION_SELECTOR = [
  'tbody tr',
  'thead',
  `[${KEEP_ROW_SELECTION_ATTR}]`,
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  'button',
  'input',
  'textarea',
  'select',
  '[role="combobox"]',
  '[role="checkbox"]',
  '[contenteditable="true"]',
].join(', ');

/** Đang mở modal → treo luật bỏ chọn (bấm lớp phủ để đóng không phải là "bỏ chọn"). */
export const OPEN_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';
