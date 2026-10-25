/**
 * Đường dẫn endpoint `/users` — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 * Khớp `user.routes.ts` phía BE (`docs/plan/runbook-phase0-be.md §B7.5`).
 */
export const userApi = {
  /** GET — danh sách, hỗ trợ `q`/`role`/`status`/`page`/`limit`. */
  list: '/users',
  /** POST — tạo tài khoản mới. */
  create: '/users',
  /** GET — hồ sơ một người dùng. */
  detail: (id: string) => `/users/${id}`,
  /** POST — khoá tài khoản, body `{ reason }`. */
  lock: (id: string) => `/users/${id}/lock`,
  /** POST — mở khoá tài khoản, body `{ reason }`. */
  unlock: (id: string) => `/users/${id}/unlock`,
  /** PATCH — đổi vai trò hệ thống, body `{ role, reason }`. CHỈ vai `admin`. */
  changeRole: (id: string) => `/users/${id}/role`,
  /** GET — danh sách phiên đăng nhập còn hiệu lực. */
  sessions: (id: string) => `/users/${id}/sessions`,
  /** DELETE — thu hồi một phiên. */
  revokeSession: (id: string, sessionId: string) => `/users/${id}/sessions/${sessionId}`,
  /**
   * POST — ẩn danh hoá tài khoản, body `{ mode: 'GRACE'|'NOW', reason, confirmEmail? }`.
   * Quyền `user:delete` — cùng router mount ở cả `/users` và `/admin/users`
   * (`be.md p0-01 §1/§4`), dùng namespace `/admin/users` khớp hợp đồng đã chốt.
   */
  anonymize: (id: string) => `/admin/users/${id}/anonymize`,
  /** POST — huỷ yêu cầu xoá đang chờ (`PENDING_DELETION`), body `{ reason }`. */
  anonymizeCancel: (id: string) => `/admin/users/${id}/anonymize/cancel`,
  /**
   * GET — đăng nhập sinh trắc học của một người dùng, `?status=ACTIVE|REVOKED|ALL`
   * (mặc định ACTIVE). Quyền `user:view`. Cùng router mount ở `/users` VÀ
   * `/admin/users` (`be/src/router.ts`) — dùng `/admin/users` khớp hợp đồng đã chốt.
   */
  biometricCredentials: (id: string) => `/admin/users/${id}/biometric-credentials`,
  /** POST — thu hồi một credential, body `{ reason }` (≥ 10 ký tự). Quyền `user:update`. */
  biometricRevoke: (id: string, credentialId: string) =>
    `/admin/users/${id}/biometric-credentials/${credentialId}/revoke`,
  /**
   * POST — gỡ ảnh đại diện VI PHẠM, body `{ reason }` (10–500 ký tự). Quyền `user:update`; BE ghi audit
   * `user.avatar-remove`, trả `{ removed, user }` (`removed: false` = người dùng chưa đặt ảnh).
   */
  removeAvatar: (id: string) => `/admin/users/${id}/avatar/remove`,
} as const;
