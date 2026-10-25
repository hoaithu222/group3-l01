import type { Notification } from 'expo-notifications';

import { queryClient } from '@/core/config/query-client';

import { useInAppBannerStore } from './in-app-banner.store';
import { notificationKeys } from './notification.keys';
import { playMessageSound } from './play-message-sound';
import type { AccountNotificationPreference } from './preferences.types';
import type { PushPayload } from './push-payload.types';

const FALLBACK_TITLE = 'Super App';

/** `sound` của cài đặt tài khoản (đã cache nếu người dùng từng mở màn Thông báo); chưa biết → bật (mặc định hệ thống). */
function soundEnabled(): boolean {
  return queryClient.getQueryData<AccountNotificationPreference>(notificationKeys.prefs)?.sound ?? true;
}

/**
 * Hiện banner trong app cho một push tin nhắn vừa tới lúc foreground (p1-07 `app.md` §4.4). Chạy TRONG
 * `handleNotification` (hết hạn 3 giây) nên chỉ làm việc đồng bộ, rẻ: ghi store + kích âm.
 *
 * `title`/`body` lấy nguyên từ thông báo — BE đã soạn theo `lockScreenPreview` (ẩn/tên người gửi/xem trước), nên
 * banner không bao giờ lộ nhiều hơn màn hình khoá.
 */
export function presentInAppBanner(notification: Notification, payload: PushPayload): void {
  const { body, title } = notification.request.content;
  useInAppBannerStore.getState().show({
    body: body ?? null,
    id: notification.request.identifier,
    payload,
    title: title ?? FALLBACK_TITLE,
  });
  if (soundEnabled()) playMessageSound();
}
