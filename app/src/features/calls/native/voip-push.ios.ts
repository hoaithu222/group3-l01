import { Platform } from 'react-native';
import RNVoipPushNotification from 'react-native-voip-push-notification';

import { registerVoipPushToken } from '@/core/notifications';

import { callsService } from '../api/calls.service';
import { callStoreApi } from '../store/call.store';
import { parseCallPushData, shouldHandleCallPush } from './call-push.parse';

/**
 * Đồng bộ `callStore` từ một payload VoIP đã parse được — dùng chung cho `notification` (app đang mở, hiếm) và
 * `didLoadWithEvents` (app vừa được PushKit đánh thức từ trạng thái kill — README p2-02 §3.1 bước 3, ca CHÍNH).
 * CallKit đã được NATIVE báo rồi (AppDelegate đã patch, đồng bộ, TRƯỚC khi JS kịp chạy — `plugins/with-voip-push.js`):
 * JS chỉ cần biết `callId` rồi lấy REST + `SYNC` — pattern dùng chung với `app/call/[callId].tsx` (mọi logic đổ
 * chuông đúng phase/hết hạn đã nằm sẵn trong `call-signal.reducer.ts`, không tự dựng `IncomingCallView` ở đây).
 */
function syncFromPushPayload(raw: unknown, meId: string | null): void {
  const data = parseCallPushData(raw);
  if (!data || !shouldHandleCallPush(data, meId)) return;
  void callsService
    .get(data.callId)
    .then((call) => callStoreApi.dispatch({ call, type: 'SYNC' }))
    .catch(() => undefined); // mất mạng / hết quyền — bỏ qua, các đường đồng bộ khác (socket, mở màn cuộc gọi) sẽ thử lại
}

/**
 * Đăng ký PushKit (iOS): gửi token VoIP lên BE và đồng bộ `callStore` khi có payload đến trong lúc app đang mở.
 * KHÔNG làm gì trên Android — trả hàm huỷ rỗng.
 *
 * ⚠️ Quyết định KHÔNG gọi `RNVoipPushNotification.onVoipNotificationCompleted()`: nhánh Objective-C của
 * `plugins/with-voip-push.js` truyền THẲNG completion của PushKit vào `RNCallKeep.reportNewIncomingCall(...,
 * withCompletionHandler:)` — native tự gọi `completion()` khi CallKit báo xong (xem `RNCallKeep.m`, cuối
 * `reportNewIncomingCallWithUUID:update:completion:`). Gọi thêm ở JS là gọi ĐÚP cùng một completion handler của
 * PushKit — rủi ro app bị hệ thống đóng vì "gọi completion nhiều lần" ngay giữa lúc có cuộc gọi tới, hậu quả nặng
 * hơn nhiều so với bỏ qua một lời gọi không bắt buộc. Nhánh Swift của cùng plugin lại truyền `withCompletionHandler:
 * nil` (không tự gọi) — đây là chỗ LỆCH giữa hai nhánh ngôn ngữ, CHƯA kiểm được trên máy thật (Windows không
 * `expo prebuild --platform ios` được, xem đầu `plugins/with-voip-push.js`). Việc cần làm khi có máy macOS: xác nhận
 * `AppDelegate` sinh ra dùng ngôn ngữ nào; nếu là Swift thì bổ sung gọi `onVoipNotificationCompleted` ở đây.
 */
export function setupVoipPush(userId: string | null): () => void {
  if (Platform.OS !== 'ios') return () => undefined;

  RNVoipPushNotification.addEventListener('register', (token) => {
    if (!userId) return; // dev bypass (`authEnabled=false`) hoặc phiên chưa có user — không có ai để đăng ký token
    void registerVoipPushToken(userId, token);
  });

  RNVoipPushNotification.addEventListener('notification', (notification) => {
    syncFromPushPayload(notification, userId);
  });

  RNVoipPushNotification.addEventListener('didLoadWithEvents', (events) => {
    if (!events) return;
    for (const event of events) {
      if (event.name === RNVoipPushNotification.RNVoipPushRemoteNotificationReceivedEvent) {
        syncFromPushPayload(event.data, userId);
      }
    }
  });

  // Bước cuối theo README của gói: đăng ký SAU khi đã gắn listener, để không lỡ sự kiện `register` bắn ngay lập tức.
  RNVoipPushNotification.registerVoipToken();

  return () => {
    RNVoipPushNotification.removeEventListener('register');
    RNVoipPushNotification.removeEventListener('notification');
    RNVoipPushNotification.removeEventListener('didLoadWithEvents');
  };
}
