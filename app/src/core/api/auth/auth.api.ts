/**
 * Đường dẫn endpoint xác thực — nối sau `appConfig.apiBaseUrl`.
 *
 * Tách riêng khỏi service để đổi đường dẫn không phải đụng vào logic, và để
 * `grep` một lần là thấy hết mặt tiếp xúc với backend.
 *
 * ⚠️ `REFRESH` được khai ở `core/config/auth.config.ts` (hằng `AUTH_REFRESH_PATH`)
 * chứ không phải ở đây, vì lời gọi refresh đi bằng `fetch` trần ngoài `apiClient` —
 * xem chú thích trong `session.ts`.
 */
export const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  /**
   * Đăng xuất MỌI thiết bị, kể cả máy đang gọi — CẦN access token (`authenticateToken`), khác `LOGOUT` (chấp nhận
   * refresh token trần). Phản hồi `{ revokedSessions }`. 429 khi vượt hạn mức thao tác tài khoản.
   */
  LOGOUT_ALL: '/auth/logout-all',
  REGISTER: '/auth/register',
  /** Đăng nhập mạng xã hội (Google qua Firebase) — body `{ idToken, nonce }`, nonce dùng MỘT LẦN như `LOGIN`. */
  FIREBASE_LOGIN: '/auth/firebase-login',
  ME: '/auth/me',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  /** Đổi mật khẩu khi ĐÃ đăng nhập (p0-01 mục 10) — `PATCH`, cần access token. */
  CHANGE_PASSWORD: '/auth/change-password',
  /** Xác minh email bằng mã 6 số (p3-04 `INV_008` `EMAIL_NOT_VERIFIED`) — cả hai cần access token; gửi mã tối đa 3 lần/15 phút/tài khoản. */
  VERIFY_EMAIL_SEND: '/auth/verify-email/send',
  VERIFY_EMAIL_CONFIRM: '/auth/verify-email/confirm',

  /**
   * Mã dùng MỘT LẦN, bắt buộc lấy MỚI ngay trước `login` / `register` /
   * `biometric/login` (p0-13). ⛔ Không cache, không tái dùng giữa các lượt gọi
   * — nonce hết hạn sau `expiresIn` giây và BE từ chối nonce đã dùng.
   */
  NONCE: '/auth/nonce',

  BIOMETRIC_ENROLL: '/auth/biometric/enroll',
  BIOMETRIC_LOGIN: '/auth/biometric/login',
  BIOMETRIC_CREDENTIALS: '/auth/biometric/credentials',

  /** "Phiên đăng nhập" (p0-01 mục 10, mở từ `me/settings`). */
  SESSIONS: '/auth/sessions',

  /**
   * "Xoá tài khoản (ân hạn)" (p0-01 mục 10) — CẦN access token.
   * Ẩn danh hoá thật sự chỉ chạy sau `LIMITS.deletion.graceDays` ngày (job BE).
   */
  DELETE_REQUEST: '/me/delete-request',
  /** ⛔ KHÔNG cần access token — xem chú thích `AccountDeletionCancelPayload`. */
  DELETE_CANCEL: '/me/delete-cancel',
  /** "Quyền riêng tư" (p0-01 mục 10) — `readReceipts`/`showPresence`. */
  PRIVACY: '/me/privacy',
  /** SĐT TỰ KHAI của chính mình (`PATCH`, `{ phone: string | null }`) — BE chuẩn hoá E.164, chưa xác minh. */
  PHONE: '/me/phone',
} as const;

/** `DELETE /auth/biometric/credentials/:id` — hàm vì có tham số động. */
export function biometricCredentialPath(credentialId: string): string {
  return `${AUTH_ENDPOINTS.BIOMETRIC_CREDENTIALS}/${credentialId}`;
}

/** `DELETE /auth/sessions/:id` — thu hồi một phiên đăng nhập. */
export function sessionPath(sessionId: string): string {
  return `${AUTH_ENDPOINTS.SESSIONS}/${sessionId}`;
}
