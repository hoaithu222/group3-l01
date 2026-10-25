import * as Notifications from 'expo-notifications';

import { isRoomJoined } from '@/core/socket';
import { logger } from '@/shared/utils/logger';
import { useAuthStore } from '@/shell/store/slices/auth';

import { ensureAndroidChannels } from './android-channels';
import {
  decideForeground,
  toNotificationBehavior,
  usesInAppBanner,
  type ForegroundContext,
} from './foreground-policy';
import { presentInAppBanner } from './in-app-banner';
import { extractPushData, parsePushPayload } from './push-payload.types';

/** Loại phạm vi push → tên room Socket.IO (khớp `ROOM_KIND` của `features/chat/hooks/useChatRoomSocket.ts`). */
const ROOM_KIND_BY_SCOPE: Readonly<Record<string, string>> = {
  CHANNEL: 'ch',
  CONVERSATION: 'conv',
};

/** Người dùng đang mở đúng scope này — đọc registry room của socket, không có tác dụng phụ. */
export function isViewingScope(scopeType: string, scopeId: string): boolean {
  const kind = ROOM_KIND_BY_SCOPE[scopeType];
  return kind ? isRoomJoined(kind, scopeId) : false;
}

function liveContext(): ForegroundContext {
  return { currentUserId: useAuthStore.getState().user?.id, isViewing: isViewingScope };
}

let configured = false;

/**
 * Cài handler foreground và tạo kênh Android. Gọi ở TẦM MODULE của `AppProviders` — cùng lý do
 * `configureZodLocale()` ở đó: handler phải có TRƯỚC khi push đầu tiên tới, mà effect chạy sau
 * lần vẽ đầu. Không có handler thì expo KHÔNG hiện banner foreground (mặc định là ẩn) — push
 * tới khi đang mở app biến mất im lặng.
 *
 * Idempotent (Fast Refresh nạp lại module không cài lại).
 */
export function initNotifications(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleError: (_id, error) => {
      if (__DEV__) logger.warn('[push] handler foreground lỗi:', error);
    },
    // ⚠️ Hết hạn 3 giây thì expo huỷ thông báo — nên KHÔNG await gì nặng ở đây (chỉ đọc bộ nhớ).
    handleNotification: async (notification) => {
      const payload = parsePushPayload(extractPushData(notification));
      const verdict = decideForeground(payload, liveContext());
      // p1-07 #12: tin nhắn của cuộc trò chuyện KHÁC → banner trong app (tôn trọng `sound`, không trùng banner hệ thống).
      if (verdict.show && payload && usesInAppBanner(payload.type)) {
        presentInAppBanner(notification, payload);
        return toNotificationBehavior({ reason: 'in-app-banner', show: false });
      }
      return toNotificationBehavior(verdict);
    },
  });

  // Kênh phải có trước khi xin quyền (Android 13+) — xem `ensureAndroidChannels`.
  void ensureAndroidChannels().catch((error: unknown) => {
    if (__DEV__) logger.warn('[push] không tạo được kênh thông báo:', error);
  });
}
