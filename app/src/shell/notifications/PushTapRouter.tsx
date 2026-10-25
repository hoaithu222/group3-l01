import { usePushTapRouting } from './usePushTapRouting';

/**
 * Điều hướng khi chạm thông báo — HEADLESS, không vẽ gì (cùng kiểu `AppLockBoundary`).
 *
 * Mount ở `app/_layout.tsx` (`RootNavigator`), NGANG HÀNG với `<Stack>` và chỉ sau khi phiên đã khôi phục
 * xong — không đặt trong `AppProviders`: `useRootNavigationState()` cần `NavigationContainer` phía trên
 * (ném "Couldn't find a navigation object" khi thiếu, ví dụ ở test dựng riêng cây provider), và điều hướng
 * trước khi navigator gốc dựng thì bị nuốt.
 */
export function PushTapRouter(): null {
  usePushTapRouting();
  return null;
}
