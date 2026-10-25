/**
 * link.utils — hành vi MỞ TRANG của mọi control điều hướng trong app.
 *
 * ⛔ VÌ SAO TỒN TẠI: một control "đi tới trang khác" mà render bằng `<button>`
 *    + `navigate()` thì trình duyệt KHÔNG biết nó là liên kết. Hệ quả (đã gặp ở
 *    header):
 *      · chuột PHẢI → không có "Mở liên kết trong tab mới"
 *      · Ctrl/⌘ + click, chuột GIỮA → không mở tab mới, chỉ đổi tab tại chỗ
 *      · hover → thanh trạng thái không hiện URL, không "Sao chép địa chỉ"
 *      · Ctrl+Enter khi focus bằng bàn phím → không mở tab mới
 *    Cách sửa DUY NHẤT là render `<Link>`/`<a>` có `href` THẬT. Mấy helper dưới
 *    đây là phần còn lại: giữ điều hướng SPA cho click thường, nhường quyền cho
 *    trình duyệt ở mọi tổ hợp còn lại.
 *
 * Xem `docs/rules/navigable-controls.md` để biết control nào bắt buộc có href.
 */

import type { MouseEvent } from 'react';

/**
 * Click NÀY có phải "mở ở nơi khác" không?
 *
 * `true` khi user giữ phím bổ trợ hoặc bấm nút chuột phụ:
 *   ⌘/Ctrl+click · Shift+click (cửa sổ mới) · Alt+click (tải xuống) · chuột giữa.
 *
 * Handler của link PHẢI `return` sớm khi hàm này trả `true` — đừng
 * `preventDefault()`, đừng `navigate()`: để nguyên cho trình duyệt xử lý.
 */
export function isModifiedClick(e: MouseEvent<Element>): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

/**
 * Thuộc tính cho liên kết LUÔN mở tab mới.
 *
 * `rel="noopener noreferrer"` là BẮT BUỘC đi kèm `target="_blank"`: thiếu
 * `noopener` thì tab mới giữ được `window.opener` và có thể điều hướng ngược
 * tab gốc (tabnabbing).
 */
export const NEW_TAB_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

/**
 * Mở URL ở tab mới BẰNG CODE (không qua click của user).
 *
 * ⚠️ CHỈ dùng khi thật sự không có phần tử liên kết để bấm — vd lệnh từ context
 *    menu tự vẽ, hoặc phím tắt. Control bấm được thì phải là `<Link>` với `href`
 *    thật, đừng thay bằng hàm này: `window.open` không cho chuột phải, không
 *    hiện URL khi hover và hay bị chặn popup.
 */
export function openInNewTab(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}
