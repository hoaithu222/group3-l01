import { shouldDeferLock } from './lock-deferrers';

/**
 * Luật QUYẾT ĐỊNH có khoá hay không — tách khỏi `AppLockBoundary.tsx` để test
 * được bằng hàm thuần, không cần dựng `AppState`/React (mẫu giống
 * `refreshSession()`/`checkLock` tách biệt luận lý khỏi hạ tầng I/O).
 */

export type LockDecision = 'defer' | 'lock' | 'skip';

export interface CheckLockInput {
  /**
   * Đang có PHIÊN không. Mặc định `true` (giữ nguyên hàm gọi cũ). ⛔ Đăng xuất thường GIỮ gắn kết
   * sinh trắc học, nên `hasBiometricBinding` đúng cả khi đã đăng xuất — không kiểm phiên thì ở lại
   * màn Đăng nhập ≥ 5 phút rồi quay lại là lớp phủ "Mở khoá để tiếp tục" đè lên màn Đăng nhập,
   * "mở khoá" xong vẫn chưa đăng nhập. Khoá là để bảo vệ một phiên SỐNG.
   */
  isAuthenticated?: boolean;
  /** Máy có đang gắn đăng nhập sinh trắc học không — không có thì không có gì để khoá LẠI (BIO chưa bật). */
  hasBiometricBinding: boolean;
  /** `SystemConfig` `auth.appLock.enabled` (qua `/capabilities`). */
  appLockEnabled: boolean;
  /** Mốc thời gian (ms) app rời `active`, `null` nếu chưa từng rời. */
  backgroundedAt: number | null;
  now: number;
  /** `auth.appLock.lockAfterBackgroundSeconds` — ngưỡng cấu hình được ở BE. */
  lockAfterBackgroundSeconds: number;
}

/**
 * Quyết định khi app quay lại `active` SAU khi đã ở `background`.
 *
 * ⛔ Hàm này KHÔNG tự gọi `shouldDeferLock()` khi trả `skip` — hoãn chỉ có ý
 * nghĩa khi các điều kiện khác đã hội đủ để khoá; hoãn một quyết định "vốn dĩ
 * không khoá" là vô nghĩa và dễ gây hiểu lầm khi đọc log.
 */
export function checkLock(input: CheckLockInput): LockDecision {
  if (input.isAuthenticated === false) return 'skip';
  if (!input.appLockEnabled || !input.hasBiometricBinding) return 'skip';
  if (input.backgroundedAt === null) return 'skip';

  const elapsedSeconds = (input.now - input.backgroundedAt) / 1000;
  if (elapsedSeconds < input.lockAfterBackgroundSeconds) return 'skip';

  return shouldDeferLock() ? 'defer' : 'lock';
}

export interface ShouldLockOnColdStartInput {
  hasBiometricBinding: boolean;
  appLockEnabled: boolean;
}

/**
 * Quyết định lúc MỞ APP LẠNH còn phiên sống (`useSessionBootstrap`).
 *
 * Không có khái niệm "vừa ở nền bao lâu" ở đây — mở lạnh nghĩa là tiến trình
 * vừa được tạo mới, nên chỉ cần biết "có gì để khoá" (đã bật sinh trắc học) và
 * "công tắc khoá ứng dụng có bật không".
 */
export function shouldLockOnColdStart(input: ShouldLockOnColdStartInput): boolean {
  return input.hasBiometricBinding && input.appLockEnabled;
}
