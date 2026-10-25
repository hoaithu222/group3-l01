import type { RemoteMessage } from '@react-native-firebase/messaging';
import RNCallKeep, { CONSTANTS } from 'react-native-callkeep';

import { logger } from '@/shared/utils/logger';
import { useAuthStore } from '@/shell/store/slices/auth';

import { parseCallPushData, shouldHandleCallPush } from './call-push.parse';
import { setupCallKeep } from './callkeep.setup';

/**
 * Handler DÙNG CHUNG cho FCM data-only của Android — cả foreground (`onMessage`, đăng ký ở `call-native.bridge.tsx`)
 * lẫn nền/kill (`setBackgroundMessageHandler`, đăng ký ở `app/index.js`, chạy trong tiến trình JS HEADLESS riêng khi
 * app đã bị tắt hẳn). Đọc `meId` qua `.getState()` (không phải hook — hàm này chạy NGOÀI cây React, kể cả không có
 * cây React nào trong tiến trình headless).
 *
 * ⚠️ Giới hạn đã biết: nếu tiến trình headless này là lần đầu app chạy sau khi bị kill, `useAuthStore` (Zustand có
 * `persist`) có thể CHƯA kịp hydrate từ kho khoá lúc handler này chạy — `meId` đọc ra `null` và `shouldHandleCallPush`
 * sẽ từ chối push (mặc định AN TOÀN: thà bỏ lỡ một chuông còn hơn đổ chuông sai chủ). Sửa triệt để đòi hydrate đồng
 * bộ cho store xác thực — ngoài phạm vi các file `native/*` của phần việc này.
 *
 * Bọc try/catch quanh TOÀN BỘ: hàm chạy trong ngữ cảnh nền/headless, ném lỗi ra ngoài có thể làm crash tiến trình đó
 * (không có `ErrorBoundary` nào bắt được ở ngoài cây React).
 */
export async function handleAndroidCallPush(remoteMessage: RemoteMessage): Promise<void> {
  try {
    const data = parseCallPushData(remoteMessage.data);
    const meId = useAuthStore.getState().user?.id ?? null;
    if (!data || !shouldHandleCallPush(data, meId)) return;

    if (data.type === 'call.incoming') {
      await setupCallKeep(); // phòng khi đây là lần đầu tiến trình này chạy `RNCallKeep` (headless chưa từng `setup()`)
      RNCallKeep.displayIncomingCall(
        data.callUuid,
        data.callerId,
        data.callerName || 'Super App',
        'generic',
        data.mediaKind === 'VIDEO',
      );
      return;
    }

    if (data.type === 'call.cancelled' || data.type === 'call.answered-elsewhere') {
      // An toàn khi gọi kể cả không có cuộc gọi UUID đó đang hiện (no-op phía native).
      RNCallKeep.reportEndCallWithUUID(data.callUuid, CONSTANTS.END_CALL_REASONS.REMOTE_ENDED);
    }
    // `call.missed`: BE đã gửi kèm `notification` có alert (be.md §5.1) — hệ điều hành tự hiện, không cần làm gì ở đây.
  } catch (error) {
    logger.warn('[call-push.android] xử lý push cuộc gọi lỗi:', error);
  }
}
