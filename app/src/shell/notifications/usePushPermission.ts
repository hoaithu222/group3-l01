import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  getPushPermission,
  openNotificationSettings,
  registerPushToken,
  requestPushPermission,
  type PushPermissionState,
} from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Trạng thái quyền thông báo của hệ điều hành + hành động bật (p0-06 `app.md` §3, PUSH-11).
 *
 * `permission = null` khi CHƯA đọc xong — nơi vẽ phải coi đó là "đang tải", không phải "đã tắt"
 * (hiện nhầm "Đang tắt trong Cài đặt hệ thống" một nhịp rồi đổi là kiểu chớp gây mất tin).
 *
 * Tự đọc lại khi app quay về `active`: người dùng vừa sang Cài đặt hệ thống bật/tắt quyền rồi quay lại.
 */
export function usePushPermission() {
  const userId = useAuthStore((state) => state.user?.id);
  const [permission, setPermission] = useState<PushPermissionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = (): void => {
      void getPushPermission().then((next) => {
        if (!cancelled) setPermission(next);
      });
    };

    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  /**
   * Hiện hộp thoại hệ thống (chỉ khi còn `undetermined`) rồi đăng ký token nếu được cấp.
   * Trả trạng thái mới — nơi gọi quyết định có chuyển sang `openSettings()` khi vẫn `denied`.
   */
  const enable = useCallback(async (): Promise<PushPermissionState> => {
    const next = await requestPushPermission();
    setPermission(next);
    if (next === 'granted' && userId) void registerPushToken(userId);
    return next;
  }, [userId]);

  return { enable, openSettings: openNotificationSettings, permission };
}
