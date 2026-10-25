import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { registerPushToken, registerRotatedToken } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Giữ token FCM của máy này luôn khớp với BE trong lúc đã đăng nhập (p0-06 `app.md` §4 "Đăng ký").
 *
 * Ba lúc đăng ký (đều qua `registerPushToken`, single-flight, không lặp khi token không đổi):
 *  1. Ngay khi phiên `authenticated` có `user.id` — sau bootstrap hoặc sau đăng nhập.
 *  2. App quay lại `active` — người dùng có thể vừa bật quyền trong Cài đặt hệ thống (PUSH-11), và
 *     `POST` còn làm mới `lastSeenAt` để BE không coi token là quá hạn (60 ngày).
 *  3. Firebase xoay token (`addPushTokenListener`) — token cũ đã chết, đăng ký ngay token mới.
 *
 * ⛔ KHÔNG xin quyền ở đây. `registerPushToken` chỉ chạy khi quyền ĐÃ `granted`; hộp thoại hệ thống
 * chỉ hiện sau khi người dùng bấm "Bật" ở primer/Cài đặt (`usePushPermission().enable`).
 */
export function usePushRegistration(): void {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return undefined;

    void registerPushToken(userId);

    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      if (token.type === 'android' && typeof token.data === 'string') {
        void registerRotatedToken(userId, token.data);
      }
    });
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void registerPushToken(userId);
    });

    return () => {
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [status, userId]);
}
