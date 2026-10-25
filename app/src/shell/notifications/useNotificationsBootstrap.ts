import { usePushRegistration } from './usePushRegistration';
import { usePushSessionCleanup } from './usePushSessionCleanup';

/**
 * Nối thông báo đẩy với vòng đời app — gọi MỘT lần ở `AppProviders` (p0-06 `app.md` §2): đăng ký token FCM khi
 * đã đăng nhập, dọn khay/huy hiệu khi rời phiên.
 *
 * Ba phần còn lại nằm chỗ khác vì cần thứ mà `AppProviders` không có:
 *  · `initNotifications()` (handler foreground + kênh Android) — TẦM MODULE của `AppProviders`, không phải
 *    effect: xem `core/notifications/notifications.setup.ts`.
 *  · `PushTapRouter` (chạm → điều hướng) — `RootNavigator` ở `app/_layout.tsx`, cần navigator gốc.
 *  · `PushPrimerHost` (tấm mời bật) — `(app)/_layout.tsx`, cần biết route hiện tại.
 */
export function useNotificationsBootstrap(): void {
  usePushRegistration();
  usePushSessionCleanup();
}
