import * as Notifications from 'expo-notifications';

import { setAppBadgeCount } from './badge';
import { resetPushRegistration } from './device-registration';
import { useInAppBannerStore } from './in-app-banner.store';

/**
 * Dọn dấu vết thông báo CỤC BỘ khi rời phiên đăng nhập (p0-06 `app.md` §5 "Logout", NT-07):
 * thông báo còn trên khay không được để người dùng SAU (máy dùng chung) đọc thấy.
 *
 * Không đụng tới BE — việc gỡ token phía server là `unregisterThisDevice()` (cần access token,
 * nên chỉ chạy được khi đăng xuất CHỦ ĐỘNG). Hàm này chạy được cả khi phiên chết ngoài ý muốn (401).
 */
export async function wipeLocalPushState(): Promise<void> {
  resetPushRegistration();
  // Banner trong app của người cũ không được còn trên màn hình người mới (NT-07).
  useInAppBannerStore.getState().dismiss();
  await Promise.all([
    Notifications.dismissAllNotificationsAsync().catch(() => undefined),
    setAppBadgeCount(0),
  ]);
}
