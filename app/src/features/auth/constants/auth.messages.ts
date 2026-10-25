/**
 * Câu chữ tiếng Việt dùng chung của các màn xác thực (đăng ký, quên/đặt lại mật khẩu).
 */

/**
 * ⛔ TRUNG TÍNH có chủ ý ("Nếu email này có tài khoản…"): nói thẳng "Đã gửi tới a@b.com" biến màn
 * hình thành công cụ dò xem một địa chỉ có tài khoản hay không. Hiện bằng `Alert` không tự tắt —
 * đây là hướng dẫn bước kế tiếp, toast 5 giây biến mất trước khi người dùng kịp mở hộp thư.
 */
export const FORGOT_PASSWORD_SENT_TITLE = 'Đã gửi yêu cầu';
export const FORGOT_PASSWORD_SENT_MESSAGE =
  'Nếu email này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Hãy kiểm tra cả thư rác — mã chỉ có hiệu lực trong thời gian ngắn.';
