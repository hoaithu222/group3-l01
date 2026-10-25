/**
 * Câu chữ tiếng Việt cho đăng nhập sinh trắc học + khoá ứng dụng — GHÉP TỪ
 * NHÃN (`"Face ID"`, `"vân tay"`, `"khuôn mặt"`…) để một luồng chữ duy nhất đọc
 * xuôi với MỌI loại cảm biến (`app.md` §7).
 *
 * Tập trung ở một file để không có hai câu khác nhau cho cùng một tình huống —
 * rải chuỗi trong từng component là chỗ dễ lệch nhau nhất khi có người sửa một
 * câu mà quên câu còn lại.
 *
 * ⚠️ File này CHỈ chứa câu chữ của luồng ĐĂNG NHẬP + KHOÁ ỨNG DỤNG (thuộc
 * `features/auth`). Câu chữ riêng của màn BẬT TÍNH NĂNG ở Cài đặt nằm ở
 * `features/me/constants/biometric.messages.ts` — tách ra vì `docs/rules/feature-structure.md`
 * cấm `features/me` nhập chéo `features/auth` (base-rules §5), và gộp chung
 * một file sẽ buộc bên `me` phải import từ `auth`.
 */

/** "Đăng nhập bằng Face ID", "Đăng nhập bằng vân tay"… */
export function biometricLoginLabel(label: string): string {
  return `Đăng nhập bằng ${label}`;
}

/** `accessibilityLabel` của nút sinh trắc học cạnh nút "Đăng nhập". */
export function biometricLoginButtonA11yLabel(label: string): string {
  return `Đăng nhập bằng ${label}`;
}

/** Prompt hệ điều hành — hộp quét lúc ĐĂNG NHẬP. */
export const BIOMETRIC_LOGIN_PROMPT = 'Đăng nhập Super App';

/** Prompt hệ điều hành — hộp quét lúc MỞ KHOÁ ứng dụng (P1). */
export const BIOMETRIC_UNLOCK_PROMPT = 'Mở khoá Super App';

/** Cấu hình sinh trắc học trên máy đã đổi ⇒ mục Keychain bị vô hiệu. */
export function biometricInvalidatedMessage(label: string): string {
  return `Cài đặt ${label} trên máy đã thay đổi. Vui lòng đăng nhập bằng mật khẩu rồi bật lại.`;
}

/** Sai/huỷ quét quá nhiều lần liên tiếp — hệ điều hành tạm khoá cảm biến. */
export function biometricLockoutMessage(label: string): string {
  return `${label} tạm thời bị khoá do thao tác sai quá nhiều lần. Vui lòng thử lại sau hoặc đăng nhập bằng mật khẩu.`;
}

/** Lỗi đọc kho khoá không xác định được nguyên nhân cụ thể. */
export function biometricFailedMessage(label: string): string {
  return `Không xác thực được bằng ${label}. Vui lòng đăng nhập bằng mật khẩu.`;
}

/** Chân màn lớp phủ khoá (P1). */
export const APP_LOCK_NOT_YOU_LOGOUT = 'Không phải bạn? Đăng xuất';

/** Lớp phủ khoá — cảm biến bị khoá tạm thời, gợi ý dùng mã khoá máy/mật khẩu. */
export const APP_LOCK_LOCKOUT_HINT = 'Dùng mã khoá máy hoặc mật khẩu để mở khoá.';

/** Lớp phủ khoá — máy không còn sinh trắc học nào khả dụng. */
export const APP_LOCK_NOT_ENROLLED_HINT = 'Dùng mật khẩu để mở khoá.';

/** Lớp phủ khoá — mở bằng mật khẩu cần mạng, khác nhánh sinh trắc/mã máy. */
export const APP_LOCK_PASSWORD_REQUIRES_NETWORK =
  'Không kết nối được máy chủ. Hãy dùng vân tay/Face ID hoặc mã khoá máy để mở khoá.';
