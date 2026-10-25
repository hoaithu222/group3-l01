import type {
  BiometricPlatform,
  BiometricRevokeReason,
  BiometricStatusFilter,
  BiometryKind,
  SessionAuthMethod,
} from '../types/user.types';

/** Ô trống thống nhất khi thiếu dữ liệu hoặc gặp giá trị BE trả mà UI chưa biết. */
const UNKNOWN = '—';

/**
 * Tra bảng nhãn theo khoá BẤT KỲ mà BE gửi. `hasOwnProperty` chứ không `map[key]`:
 * khoá lạ như `"constructor"` sẽ rơi vào prototype của object và trả về hàm.
 */
function lookup(map: Readonly<Record<string, string>>, key: string | null | undefined): string {
  if (!key || !Object.prototype.hasOwnProperty.call(map, key)) return UNKNOWN;
  return map[key];
}

const SESSION_AUTH_METHOD_LABEL: Record<SessionAuthMethod, string> = {
  PASSWORD: 'Mật khẩu',
  BIOMETRIC: 'Sinh trắc học',
};

/** Cột "Cách đăng nhập" của bảng phiên — thiếu / giá trị lạ ⇒ "—". */
export const sessionAuthMethodLabel = (method: string | null | undefined): string =>
  lookup(SESSION_AUTH_METHOD_LABEL, method);

const BIOMETRIC_PLATFORM_LABEL: Record<BiometricPlatform, string> = {
  ANDROID: 'Android',
  IOS: 'iOS',
  WEB: 'Web',
};

export const biometricPlatformLabel = (platform: string | null | undefined): string =>
  lookup(BIOMETRIC_PLATFORM_LABEL, platform);

/**
 * Loại sinh trắc học đọc được. `FACE` trên iOS chính là Face ID; trên Android
 * chỉ là "Khuôn mặt" (không có thương hiệu riêng).
 */
export function biometryKindLabel(
  kind: BiometryKind | string | null | undefined,
  platform?: BiometricPlatform | string | null,
): string {
  switch (kind) {
    case 'FACE':
      return platform === 'IOS' ? 'Face ID' : 'Khuôn mặt';
    case 'FINGERPRINT':
      return 'Vân tay';
    case 'IRIS':
      return 'Mống mắt';
    case 'GENERIC':
      return 'Sinh trắc học';
    default:
      return UNKNOWN;
  }
}

const BIOMETRIC_REVOKE_REASON_LABEL: Record<BiometricRevokeReason, string> = {
  REPLACED: 'Bật lại trên cùng máy',
  USER_DISABLED: 'Người dùng tắt',
  ACCOUNT_SWITCHED: 'Đổi tài khoản trên máy',
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  SESSIONS_REVOKED: 'Thu hồi toàn bộ phiên',
  REUSE_DETECTED: 'Nghi ngờ lộ phiên đăng nhập',
  ACCOUNT_LOCKED: 'Tài khoản bị khoá',
  DELETION_REQUESTED: 'Yêu cầu xoá tài khoản',
  TOO_MANY_ATTEMPTS: 'Sai quá số lần',
  EXPIRED: 'Hết hạn',
  DEVICE_LIMIT: 'Vượt số thiết bị tối đa',
  ADMIN: 'Quản trị viên thu hồi',
};

/**
 * Lý do thu hồi đọc được. BE để `revokeReason` là chuỗi tự do (thêm lý do mới
 * không cần `db push`), nên mã chưa có trong bảng vẫn phải ra một câu hiểu được
 * thay vì lộ nguyên mã kỹ thuật — `null` (chưa thu hồi) ⇒ "—".
 */
export function biometricRevokeReasonLabel(reason: string | null | undefined): string {
  if (!reason) return UNKNOWN;
  const label = lookup(BIOMETRIC_REVOKE_REASON_LABEL, reason);
  return label === UNKNOWN ? 'Lý do khác' : label;
}

/** Bộ lọc của mục "Đăng nhập sinh trắc học" — đồng bộ URL `?bioStatus=`. */
export const BIOMETRIC_STATUS_OPTIONS: { key: BiometricStatusFilter; label: string }[] = [
  { key: 'ACTIVE', label: 'Đang hoạt động' },
  { key: 'REVOKED', label: 'Đã thu hồi' },
];

export const BIOMETRIC_STATUS_PARAM = 'bioStatus';
