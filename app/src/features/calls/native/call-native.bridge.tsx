import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { logger } from '@/shared/utils/logger';
import { useAuthStore } from '@/shell/store/slices/auth';

import { handleAndroidCallPush } from './call-push.android';
import { promptFullScreenIntentOnce } from './full-screen-intent';
import { setLockScreenCallUser } from './lock-screen-call';
import { bindCallKeepEvents } from './callkeep.events';
import { setupCallKeep } from './callkeep.setup';
import { setupVoipPush } from './voip-push.ios';

/**
 * Cầu nối NATIVE ↔ `callStore` cho cuộc gọi (p2-02) — không vẽ gì. Mount MỘT LẦN ở `app/(app)/_layout.tsx`, cạnh
 * `<CallHost/>`/`useCallSignals()`: `setup()` CallKit/ConnectionService, nối sự kiện trả lời/kết thúc/tắt-mic, và
 * đăng ký đường push cuộc gọi cho từng nền tảng (Android FCM data-only foreground, iOS VoIP token + payload).
 *
 * Nền/kill/máy khoá của Android KHÔNG đi qua component này nữa (01/10/2026): chuông do NATIVE dựng thẳng trong
 * `plugins/call-notification/CallPushReceiver.kt` — chạy ngay trong `onReceive`, không cần boot runtime JS.
 */
export function CallNativeBridge(): null {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id) ?? null;

  /**
   * p2-02 (Android): hai việc cho đường chuông NATIVE (`plugins/call-notification/`).
   *
   *  · `setLockScreenCallUser` — ghi `userId` xuống SharedPreferences để `CallPushReceiver` bỏ
   *    được push gửi nhầm chủ máy (token FCM của người dùng CŨ chưa kịp thu hồi). Receiver chạy
   *    cả khi tiến trình vừa được đánh thức từ cõi chết nên không đọc được store trong RAM.
   *  · `promptFullScreenIntentOnce` — Android 14+ mặc định TỪ CHỐI `USE_FULL_SCREEN_INTENT`;
   *    chưa bật thì chuông vẫn kêu nhưng màn gọi KHÔNG bung ra trên màn khoá. Mời tối đa mỗi
   *    7 ngày một lần, và im hẳn khi đã cấp.
   */
  useEffect(() => {
    setLockScreenCallUser(userId);
    if (userId) void promptFullScreenIntentOnce();
  }, [userId]);

  useEffect(() => {
    /**
     * ⚠️ Bọc try/catch phần NATIVE của cuộc gọi — BẮT BUỘC chừng nào `react-native-callkeep` còn bị loại khỏi
     * autolinking (lý do đầy đủ ở `package.json` → `expo.autolinking.exclude`): native module không tồn tại nên
     * `NativeModules.RNCallKeep` là `undefined`, và `bindCallKeepEvents()` → `RNCallKeep.addEventListener()` NÉM.
     * Effect ném thì React huỷ cả cây điều hướng — đúng thứ biến một tính năng phụ (đổ chuông kiểu hệ thống) thành
     * "app không mở được". Cùng tinh thần `setupCallKeep()` vốn đã tự nuốt lỗi.
     *
     * Gỡ try/catch khi lane p2-02 sống lại: lúc đó ném ở đây là lỗi THẬT, phải nổ để thấy.
     */
    let unbindEvents: (() => void) | undefined;
    try {
      void setupCallKeep();
      unbindEvents = bindCallKeepEvents(queryClient);
    } catch {
      unbindEvents = undefined;
    }

    let unsubscribeAndroid: (() => void) | undefined;
    if (Platform.OS === 'android') {
      try {
        unsubscribeAndroid = onMessage(getMessaging(), handleAndroidCallPush);
      } catch (error) {
        logger.warn(
          '[call-native.bridge] Firebase chưa được khởi tạo — bỏ qua push cuộc gọi foreground:',
          error,
        );
      }
    }

    let unsubscribeIos: (() => void) | undefined;
    try {
      unsubscribeIos = setupVoipPush(userId); // tự no-op trên Android
    } catch {
      unsubscribeIos = undefined;
    }

    return () => {
      unbindEvents?.();
      unsubscribeAndroid?.();
      unsubscribeIos?.();
    };
  }, [queryClient, userId]);

  return null;
}
