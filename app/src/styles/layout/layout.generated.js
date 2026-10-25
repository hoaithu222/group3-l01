/* Sinh tự động từ layout.json. ⛔ ĐỪNG SỬA TAY. */
/* eslint-disable */
// prettier-ignore
module.exports = {
  /** theme.borderRadius — GHI ĐÈ thang mặc định. Class `rounded-<tên>`. */
  borderRadius: {
    'none': '0px',
    '3xs': '4px',
    '2xs': '8px',
    'xs': '12px',
    'sm': '16px',
    'md': '24px',
    'lg': '32px',
    'full': '9999px',
  },
  /** theme.extend.spacing — THÊM tên gọi. Class `p-<tên>`, `gap-<tên>`. */
  spacing: {
    '3xs': '2px',
    '2xs': '4px',
    'xs': '8px',
    'sm': '12px',
    'md': '16px',
    'lg': '20px',
    'xl': '24px',
    '2xl': '28px',
    '3xl': '32px',
    '4xl': '40px',
    '5xl': '48px',
    '6xl': '64px',
  },
  /** theme.extend.height — chiều cao control. Class `h-control-<tên>`. */
  height: {
    'control-xs': '32px',
    'control-sm': '40px',
    'control-md': '48px',
    'control-lg': '56px',
  },
  /** theme.extend.borderWidth — nét viền theo thiết kế. */
  borderWidth: {
    'hairline': '1px',
    'medium': '1.5px',
    'thick': '2px',
  },
  /**
   * theme.screens — GHI ĐÈ thang breakpoint của Tailwind. Class `tablet:p-xl`.
   *
   * ⛔ Ghi đè chứ không extend: thang mặc định của Tailwind là số đo MÀN HÌNH
   * MÁY TÍNH (sm=640 · md=768 · lg=1024). Điện thoại rộng 360–430dp nên
   * `sm:` KHÔNG BAO GIỜ khớp trên điện thoại — class copy từ web lặng lẽ
   * không có tác dụng nào. Ba bậc dưới đây là số đo THẬT của thiết bị.
   */
  screens: {
    'phone': '390px',
    'tablet': '600px',
    'tablet-lg': '840px',
  },
  /**
   * theme.extend.maxWidth — TRẦN bề rộng cột nội dung. Class `max-w-<tên>`,
   * dùng kèm tiền tố bậc: `tablet:w-full tablet:max-w-content tablet:self-center`.
   *
   * ⛔ Đừng thay bằng `max-w-screen-tablet` (= đúng NGƯỠNG 600 của breakpoint):
   * ngưỡng là "từ đâu coi là máy tính bảng", trần là "cột nội dung rộng tối đa
   * bao nhiêu" — hai con số khác vai, buộc chung thì đổi một là hỏng cả hai.
   */
  maxWidth: {
    'content': '720px',
  },
};
