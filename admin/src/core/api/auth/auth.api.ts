/**
 * Đường dẫn endpoint xác thực — nối sau `appConfig.apiBaseUrl`.
 *
 * BE có version thì đổi `API_PREFIX` thành `/v1` ở đúng một chỗ này.
 */
const API_PREFIX = '';

export const authApi = {
  /** GET — cấp mã nonce dùng một lần trước login/register. */
  nonce: `${API_PREFIX}/auth/nonce`,
  /** POST — email + mật khẩu, trả access token + hồ sơ người dùng. */
  login: `${API_PREFIX}/auth/login`,
  /** POST — tạo tài khoản, trả về giống `login`. */
  register: `${API_PREFIX}/auth/register`,
  /**
   * POST — đổi cookie refresh (HttpOnly) lấy access token mới.
   * ⚠️ Không có hàm `authService` nào gọi hằng số này: refresh CHỈ đi qua
   * `refreshSession()` ở `@/core/api/session` (`fetch` trần + single-flight + khoá
   * liên tab) bằng `AUTH_REFRESH_PATH` ở `@/core/config/auth.config`. Sửa đường
   * dẫn thì phải sửa cả hai chỗ.
   */
  refresh: `${API_PREFIX}/auth/refresh`,
  /** POST — thu hồi phiên phía máy chủ và xoá cookie refresh. */
  logout: `${API_PREFIX}/auth/logout`,
  /** GET — hồ sơ + vai trò + quyền của người đang đăng nhập. */
  me: `${API_PREFIX}/auth/me`,
  /** POST — gửi email đặt lại mật khẩu. */
  forgotPassword: `${API_PREFIX}/auth/forgot-password`,
  /** POST — đặt mật khẩu mới bằng token nhận qua email. */
  resetPassword: `${API_PREFIX}/auth/reset-password`,
  /** PATCH — đổi mật khẩu của chính mình (BE thu hồi các phiên khác + đăng nhập sinh trắc học). */
  changePassword: `${API_PREFIX}/auth/change-password`,
} as const;
