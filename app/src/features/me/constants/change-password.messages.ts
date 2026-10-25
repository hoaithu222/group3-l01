/**
 * Câu chữ tiếng Việt riêng của màn "Đổi mật khẩu" (p0-01 mục 10, mở từ `me/settings`).
 *
 * ⚠️ Không gộp chung với hằng số của `features/auth` — `features/me` KHÔNG được import chéo feature
 * (`docs/rules/feature-structure.md`).
 */

export const CHANGE_PASSWORD_INTRO =
  'Sau khi đổi, các thiết bị khác đang đăng nhập tài khoản này sẽ bị đăng xuất. Thiết bị này giữ nguyên phiên.';

/** Toast thành công — nói rõ hậu quả (`revokedSessions` là số phiên KHÁC đã bị đăng xuất). */
export function changePasswordSuccessMessage(revokedSessions: number): string {
  return revokedSessions > 0
    ? `Đã đổi mật khẩu. Đã đăng xuất khỏi ${revokedSessions} thiết bị khác.`
    : 'Đã đổi mật khẩu.';
}

/** BE không giữ được phiên này (đã thu hồi TẤT CẢ) nên phải đăng nhập lại bằng mật khẩu mới. */
export const CHANGE_PASSWORD_RELOGIN = 'Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.';
