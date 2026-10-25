/**
 * Kiểu dùng chung của nhóm `checkbox`.
 *
 * Tách khỏi `Checkbox.tsx` để `CheckboxMark` nhập được mà không tạo vòng
 * (`Checkbox → CheckboxMark → Checkbox`) — `import/no-cycle` chặn cứng, và trên
 * React Native vòng import hiện ra lúc CHẠY dưới dạng `undefined is not a
 * function` ở một file không liên quan.
 */

/**
 * `md` (24dp) là cỡ DUY NHẤT có trong Figma. `sm` (20dp) thêm vào cho ca
 * checkbox nằm trong một hàng danh sách dày đặc; xem báo cáo, mục "lệch thiết kế".
 */
export type CheckboxSize = 'md' | 'sm';
