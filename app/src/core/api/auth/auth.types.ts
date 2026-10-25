import type { AuthUser } from '@/shell/store/slices/auth';
import type { BiometricKind } from '@/core/auth/biometric';

/** Thân request đăng nhập. */
export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  name: string;
  password: string;
}

/**
 * Thân `POST /auth/firebase-login` (không kèm `nonce` — `authService.firebaseLogin` tự lấy nonce MỚI).
 * `idToken` là Firebase ID token (KHÔNG phải ID token của Google): BE chỉ nhận token do Firebase ký, không nhận email/tên từ client.
 */
export interface FirebaseLoginPayload {
  idToken: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

/** Trường `newPassword` khớp đúng tên field `resetPasswordSchema` phía BE (`auth.dto.ts`). */
export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

/** Khớp `changePasswordSchema` phía BE (`change-password.dto.ts`) — `PATCH /auth/change-password`. */
export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * Phản hồi `PATCH /auth/change-password`.
 *
 * ⚠️ `accessToken` CHỈ có khi BE giữ được phiên hiện tại (nhận ra qua `sid` của access token).
 * Access token cũ mang `sessionVersion` cũ nên HẾT HIỆU LỰC ngay sau lượt đổi — có token mới thì
 * phải ghi vào store; KHÔNG có thì BE đã thu hồi TẤT CẢ phiên, kể cả phiên này ⇒ phải đăng nhập lại.
 */
export interface ChangePasswordResult {
  /** Số phiên KHÁC đã bị đăng xuất. */
  revokedSessions: number;
  accessToken?: string;
}

/**
 * Phản hồi đăng nhập / làm mới token.
 *
 * Nhận CẢ HAI cách đặt tên (`accessToken` và `access_token`) vì backend .NET và
 * backend theo chuẩn OAuth đặt khác nhau, và base này không chọn hộ dự án dùng
 * cái nào. `auth.service.ts` chuẩn hoá về một dạng ngay tại cửa vào.
 */
export interface AuthTokens {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  expiresIn?: number;
  expires_in?: number;
}

export interface LoginResponse extends AuthTokens {
  user?: AuthUser;
}

/** Kết quả đã chuẩn hoá — phần còn lại của app chỉ thấy dạng này. */
export interface NormalizedSession {
  accessToken: string;
  refreshToken: string | null;
  user: AuthUser | null;
}

// ── Sinh trắc học (p0-13) ────────────────────────────────────────────────────

/** Nền tảng — trùng khớp DTO backend (`mobilePlatformSchema`, be.md §3). */
export type BiometricClientPlatform = 'ANDROID' | 'IOS';

/**
 * Phản hồi `GET /auth/nonce` — mã dùng một lần, bắt buộc lấy MỚI ngay trước
 * `login` / `register` / `biometric/login`.
 */
export interface NonceResponse {
  nonce: string;
  expiresIn: number;
}

/** Thân request `POST /auth/biometric/enroll`. */
export interface BiometricEnrollPayload {
  password: string;
  deviceId: string;
  platform: BiometricClientPlatform;
  deviceName?: string;
  biometryKind: BiometricKind;
}

/**
 * Phản hồi enroll — `secret` CHỈ trả về ĐÚNG MỘT LẦN ở đây (be.md §4: response
 * mang `Cache-Control: no-store`). Mất là phải bật lại từ đầu, không có cách
 * nào lấy lại — hợp đồng cố ý, không phải thiếu sót.
 */
export interface BiometricEnrollResponse {
  credentialId: string;
  secret: string;
  expiresAt: string;
  biometryKind: BiometricKind;
}

/**
 * Thân request `POST /auth/biometric/login`.
 *
 * ⛔ KHÔNG có trường `secret`. Đây là ĐIỂM SAI KHÁC DUY NHẤT so với bản nháp gốc
 * của `app.md`/`be.md`: bí mật thô không bao giờ rời khỏi máy sau lượt enroll —
 * `hmac` được tính CỤC BỘ bằng `computeBiometricHmac()` (`core/auth/biometric`)
 * và đây là thứ duy nhất gửi lên mạng.
 */
export interface BiometricLoginPayload {
  credentialId: string;
  deviceId: string;
  nonce: string;
  hmac: string;
}

/** Phản hồi đăng nhập sinh trắc — như đăng nhập thường, kèm thông tin credential. */
export interface BiometricLoginResponse extends LoginResponse {
  biometric?: { credentialId: string; expiresAt: string };
}

/** Một dòng trong `GET /auth/biometric/credentials` — "Thiết bị tin cậy" (P1). */
export interface BiometricCredentialItem {
  id: string;
  deviceName?: string | null;
  platform: BiometricClientPlatform;
  biometryKind: BiometricKind;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
  /** Đúng thiết bị đang gọi API này (so theo header `X-Device-Id`, be.md §4). */
  current: boolean;
}

/**
 * Lý do app tự gửi khi NGƯỜI DÙNG chủ động thu hồi (`DELETE .../credentials/:id?reason=`).
 * ⛔ Chỉ hai giá trị này — be.md §5.6 giới hạn cứng, gửi giá trị khác bị BE từ chối.
 * Các lý do khác (hết hạn, bị vô hiệu cục bộ…) gọi KHÔNG kèm `reason`.
 */
export type BiometricSelfRevokeReason = 'ACCOUNT_SWITCHED' | 'USER_DISABLED';

// ── Phiên đăng nhập (p0-01 mục 10) ──────────────────────────────────────────

/** Một dòng trong `GET /auth/sessions` — phiên đăng nhập ĐANG HOẠT ĐỘNG của chính người gọi. */
export interface SessionSummary {
  id: string;
  /** Chuỗi User-Agent thô từ BE. ⛔ KHÔNG tự parse — hiện rút gọn hoặc rơi về nhãn theo `authMethod`. */
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  /**
   * Đúng phiên đang gọi API này. BE tự chặn `DELETE .../sessions/:id` khi
   * `true` (400 `ValidationError`) — UI vẫn phải tự ẩn/khoá nút "Thu hồi" cho
   * phiên này, để không tạo trải nghiệm bấm-rồi-báo-lỗi.
   */
  isCurrent: boolean;
  authMethod: 'PASSWORD' | 'BIOMETRIC';
  deviceId: string | null;
  /** Thiết bị đăng nhập ĐẦU TIÊN của tài khoản (thiết bị gốc). Thiếu ở BE cũ ⇒ coi như `false`. */
  isOriginDevice?: boolean;
  /** Thiết bị mới làm quen (≤ 7 ngày, chưa phải gốc) — hiện nhãn "Mới". Thiếu ở BE cũ ⇒ `false`. */
  isNewDevice?: boolean;
}

// ── Xoá tài khoản (ân hạn) & Quyền riêng tư (p0-01 mục 10, phần còn lại) ────

/** Thân request `POST /me/delete-request` — CẦN access token. */
export interface AccountDeletionRequestPayload {
  password: string;
}

/**
 * Thân request `POST /me/delete-cancel`.
 *
 * ⛔ Có `email` dù đang gọi từ một phiên đã đăng nhập: tài khoản
 * `PENDING_DELETION` bị BE chặn ở tầng xác thực (be.md), coi như đã "đăng
 * xuất" logic, nên hợp đồng đòi xác minh lại đủ email + mật khẩu — không dùng
 * access token hiện có trong bộ nhớ dù nó có thể còn hạn.
 */
export interface AccountDeletionCancelPayload {
  email: string;
  password: string;
}

/**
 * Phản hồi `POST /me/delete-request`.
 *
 * ⚠️ Idempotent phía BE: gọi lại khi tài khoản ĐÃ `PENDING_DELETION` trả về
 * nguyên TRẠNG THÁI HIỆN TẠI (200, không lỗi) — nơi gọi không cần tự kiểm tra
 * trạng thái trước khi gọi.
 */
export interface AccountDeletionStatus {
  status: 'PENDING_DELETION';
  deletionGraceUntil: string;
}

/** Phản hồi `POST /me/delete-cancel`. */
export interface AccountDeletionCancelResponse {
  status: 'ACTIVE';
}

/** `PATCH /me/privacy` — hình dạng dùng CHUNG cho phản hồi và cho `AuthUser.privacy`. */
export interface PrivacySettings {
  readReceipts: boolean;
  showPresence: boolean;
  /** p4-03: hiện tôi trong bảng xếp hạng nhóm. Thiếu/`undefined` = mặc định BẬT (BE ghi `null` = mặc định). */
  showInLeaderboard?: boolean;
  /** p4-03: cho thành viên nhóm xem cấp độ và huy hiệu của tôi. Thiếu/`undefined` = mặc định BẬT. */
  showGamification?: boolean;
}

/** Thân request `PATCH /me/privacy` — BE đòi ÍT NHẤT một field. */
export type UpdatePrivacyPayload = Partial<PrivacySettings>;

/** Phản hồi `PATCH /me/phone` — SĐT đã CHUẨN HOÁ E.164 (`+84912345678`), `null` khi vừa xoá số. */
export interface UpdatePhoneResult {
  phone: string | null;
}

/** Phản hồi `POST /auth/logout-all` — số phiên đã bị thu hồi (gồm cả phiên của máy đang gọi). */
export interface LogoutAllResult {
  revokedSessions: number;
}
