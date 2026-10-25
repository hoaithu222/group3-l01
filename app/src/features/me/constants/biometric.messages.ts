/**
 * Câu chữ tiếng Việt riêng của màn BẬT/TẮT đăng nhập sinh trắc học ở Cài đặt.
 *
 * ⚠️ Tách khỏi `features/auth/constants/biometric.messages.ts` CÓ CHỦ Ý:
 * `docs/rules/feature-structure.md` (base-rules §5) cấm import chéo feature —
 * `features/me` KHÔNG được nhập bất cứ gì từ `features/auth`. Gộp chung một
 * file câu chữ sẽ buộc `useBiometricEnrollment`/`BiometricSettingRow`/
 * `BiometricEnrollSheet` phải `import ... from '@/features/auth/...'`.
 */

/** Tên hàng trong Cài đặt — cùng cách ghép với nút ở màn Đăng nhập, chỉ khác
 *  file vì lý do layering (xem chú thích đầu file). */
export function biometricFeatureLabel(label: string): string {
  return `Đăng nhập bằng ${label}`;
}

/** Tiêu đề sheet bật tính năng. */
export function biometricEnrollSheetTitle(label: string): string {
  return `Bật đăng nhập bằng ${label}`;
}

/** Dòng ngữ cảnh tài khoản trong hàng Cài đặt / sheet bật. */
export function biometricAccountContext(label: string, email: string): string {
  return `Dùng ${label} để vào lại tài khoản ${email}`;
}

/** Prompt hệ điều hành — hộp quét lúc BẬT tính năng (ghi mục Keychain mới). */
export function biometricEnableConfirmPrompt(label: string): string {
  return `Xác nhận bật đăng nhập bằng ${label}`;
}

/** Dòng cảnh báo máy dùng chung, trong sheet bật (`app.md` §10). */
export const BIOMETRIC_SHARED_DEVICE_WARNING =
  'Ai mở khoá được máy này cũng đăng nhập được tài khoản của bạn.';

/** Hàng Cài đặt: có cảm biến nhưng `isUsable=false` — hướng dẫn đi sửa ở máy. */
export function biometricUnusableGuidance(label: string): string {
  return `Vui lòng bật ${label} trong Cài đặt máy để sử dụng tính năng này.`;
}

/** Bật tính năng cần mạng — không có kết nối thì không gọi được `enroll`. */
export const BIOMETRIC_ENABLE_REQUIRES_NETWORK = 'Cần kết nối mạng để bật.';

/** Người dùng tự huỷ hộp quét lúc BẬT (Android hiện hộp khi ghi kho khoá) — nói rõ chưa bật gì. */
export function biometricEnrollCancelledMessage(label: string): string {
  return `Đã huỷ xác thực bằng ${label}. Đăng nhập bằng ${label} chưa được bật.`;
}

/** Ghi kho khoá/quét thất bại vì lý do lạ — ⛔ KHÔNG lộ thông điệp thô (tiếng Anh, tuỳ hệ điều hành). */
export function biometricEnrollFailedMessage(label: string): string {
  return `Chưa bật được đăng nhập bằng ${label}. Vui lòng thử lại.`;
}
