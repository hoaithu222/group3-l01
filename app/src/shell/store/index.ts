/**
 * Barrel của toàn bộ client state.
 *
 * ⛔ Chỉ có state THUỘC VỀ CẢ APP nằm ở đây: phiên đăng nhập và tuỳ chọn giao
 * diện. State của một màn hình cụ thể thì để cạnh chính màn hình đó
 * (`features/<tên>/store/`) — nhét vào đây là mọi feature phải biết về nhau.
 *
 * ⛔ Và KHÔNG để dữ liệu từ máy chủ ở đây. Dữ liệu server là việc của React
 * Query (cache, làm mới, trạng thái tải, thử lại). Chép nó vào zustand là tự
 * tay dựng lại toàn bộ những thứ đó, thường là dựng sai.
 */

// Phiên đăng nhập
export { useAuthStore } from './slices/auth';
export * from './slices/auth/selectors';
export type { AuthStatus, AuthUser } from './slices/auth';

// Gắn kết đăng nhập sinh trắc học (p0-13)
export { disableBiometric, reconcileBiometricBinding, useBiometricStore } from './slices/biometric';
export type { BiometricBinding } from './slices/biometric';

// Tuỳ chọn sáng/tối
export { useThemeStore } from './slices/theme';
export * from './slices/theme/selectors';
export type { ResolvedTheme, ThemePreference } from './slices/theme';
