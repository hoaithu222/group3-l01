/**
 * Kiểu dữ liệu phân hệ Người dùng — khớp `User`/`Session` (Prisma, `config-be.md §9`)
 * đã qua `sanitize()` phía BE (không có `passwordHash`/token thô).
 */

/** Vai trò hệ thống (`RoleCode` phía BE) — KHÁC `recruiter:*`/`partner:*` (gắn theo dữ liệu). */
export type UserRole = 'admin' | 'manager' | 'user';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'PENDING_DELETION' | 'ANONYMIZED';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /**
   * URL TUYỆT ĐỐI ký sẵn của ảnh đại diện (`…/api/v1/assets/<id>/image?v=THUMB&e=…&s=…`) — dùng thẳng làm `src`, KHÔNG
   * cần Bearer. Hết hạn sau 1–2 ngày (response mới luôn kèm URL mới), đừng lưu lâu. `null` = chưa đặt ảnh.
   */
  avatarUrl?: string | null;
  timezone?: string;
  emailVerified?: boolean;
  /** `!= null` ⇔ `status === 'PENDING_DELETION'` — mốc tự ẩn danh hoá nếu không huỷ kịp. */
  deletionGraceUntil?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UserListParams {
  q?: string;
  role?: string;
  status?: string;
  page: number;
  limit: number;
}

/** Cách đăng nhập tạo ra phiên (`Session.authMethod` phía BE, p0-13). */
export type SessionAuthMethod = 'PASSWORD' | 'BIOMETRIC';

/**
 * Một phiên đăng nhập còn hiệu lực — `GET /users/:id/sessions` (BE `UserSessionSummary`).
 *
 * Dạng trả về phụ thuộc AI đang xem: xem phiên của CHÍNH MÌNH ⇒ có `deviceId` đầy đủ và `isCurrent`
 * đúng; quản trị viên xem hộ người khác ⇒ chỉ có `deviceIdMasked` ("••••" + 6 ký tự cuối) và
 * `isCurrent` luôn `false`.
 */
export interface UserSession {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastUsedAt: string;
  /**
   * Hạn tuyệt đối của phiên (refresh token) — BE luôn trả. Vẫn để optional: BE cũ / dữ liệu lạ thì UI
   * hiện "—" thay vì `formatDate(undefined)` (dayjs coi `undefined` là "bây giờ").
   */
  expiresAt?: string | null;
  /** BE chỉ liệt kê phiên CÒN hiệu lực nên không trả trường này; giữ lại để hàng đã thu hồi (nếu có) vẫn hiện đúng. */
  revokedAt?: string | null;
  /** Đúng là phiên đang dùng để xem trang này (chỉ khi xem hồ sơ của chính mình) — BE từ chối thu hồi phiên này (400). */
  isCurrent?: boolean;
  /** Thiếu ở BE cũ / giá trị lạ ⇒ UI hiện "—". */
  authMethod?: SessionAuthMethod | null;
  /** Mã thiết bị đã che ("••••" + 6 ký tự cuối) — dạng DUY NHẤT được phép hiện trên UI; `null` = phiên cũ chưa ghi. */
  deviceIdMasked?: string | null;
  /**
   * Mã thiết bị ĐẦY ĐỦ — BE chỉ trả cho chính chủ. ⛔ KHÔNG hiển thị nguyên văn: đi qua
   * `sessionDeviceLabel` (che lại) — thêm chỗ hiện thô là lộ định danh thiết bị.
   */
  deviceId?: string | null;
  /** Phiên chạy trên thiết bị đăng nhập ĐẦU TIÊN của tài khoản. */
  isOriginDevice?: boolean;
  /** Thiết bị mới làm quen (≤ 7 ngày, chưa phải gốc). */
  isNewDevice?: boolean;
}

/** `BiometricKind` (Prisma) — loại sinh trắc học app đã dùng lúc bật. */
export type BiometryKind = 'FACE' | 'FINGERPRINT' | 'IRIS' | 'GENERIC';

/** `DevicePlatform` (Prisma) — DTO enroll chỉ nhận ANDROID | IOS nhưng enum có thêm WEB. */
export type BiometricPlatform = 'ANDROID' | 'IOS' | 'WEB';

export type BiometricCredentialStatus = 'ACTIVE' | 'REVOKED';

/**
 * `BiometricCredential.revokeReason` — BE khai kiểu chuỗi (không enum) để thêm
 * lý do mới mà không cần `db push`, nên UI PHẢI chịu được giá trị lạ (xem
 * `biometricRevokeReasonLabel`).
 */
export type BiometricRevokeReason =
  | 'REPLACED'
  | 'USER_DISABLED'
  | 'ACCOUNT_SWITCHED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'SESSIONS_REVOKED'
  | 'REUSE_DETECTED'
  | 'ACCOUNT_LOCKED'
  | 'DELETION_REQUESTED'
  | 'TOO_MANY_ATTEMPTS'
  | 'EXPIRED'
  | 'DEVICE_LIMIT'
  | 'ADMIN';

/**
 * Một dòng của `GET /admin/users/:id/biometric-credentials` (BE
 * `AdminBiometricCredentialDto`). ⛔ BE KHÔNG trả `secretHash`, và `deviceId`
 * chỉ về dạng rút gọn `deviceIdMasked` ("••••" + 6 ký tự cuối) — đừng thêm
 * hai trường đó vào kiểu này.
 */
export interface UserBiometricCredential {
  id: string;
  deviceName: string | null;
  deviceIdMasked: string;
  platform: BiometricPlatform;
  biometryKind: BiometryKind;
  status: BiometricCredentialStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: BiometricRevokeReason | null;
}

/** Giá trị `?status=` của endpoint liệt kê (BE còn nhận `ALL`, UI không dùng). */
export type BiometricStatusFilter = BiometricCredentialStatus;

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export interface ReasonPayload {
  reason: string;
}

export interface ChangeRolePayload {
  role: UserRole;
  reason: string;
}

/** `data` của `POST /admin/users/:id/avatar/remove`. `removed: false` = người dùng chưa đặt ảnh (BE không ghi gì). */
export interface RemoveAvatarResult {
  removed: boolean;
  user: AdminUser;
}

export type AnonymizeMode = 'GRACE' | 'NOW';

/**
 * `confirmEmail` BẮT BUỘC (BE 400 `USER_013` nếu thiếu/lệch) khi `mode: 'NOW'`
 * — phải khớp CHÍNH XÁC email người dùng bị xoá.
 */
export interface AnonymizeUserPayload {
  mode: AnonymizeMode;
  reason: string;
  confirmEmail?: string;
}

export interface AnonymizeResult {
  status: 'PENDING_DELETION' | 'ANONYMIZED';
  deletionGraceUntil?: string;
  anonymizedAt?: string;
}
