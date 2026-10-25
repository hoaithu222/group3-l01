import type { QueryClient } from '@tanstack/react-query';
import RNCallKeep from 'react-native-callkeep';

import { getCallMedia } from '@/core/media/call-media.registry';
import { logger } from '@/shared/utils/logger';

import { answerCall as answerCallAction, hangUp } from '../hooks/call-actions';
import { useCallMediaStore } from '../store/call-media.store';
import { callStoreApi } from '../store/call.store';

/** Chờ tối đa để `callStore` biết `callId` ứng với `callUUID` này — xem chú thích ở `answerCall` bên dưới. */
const ANSWER_UUID_WAIT_MS = 2000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `callUuid` của cuộc gọi client đang theo dõi (đến hoặc đang diễn ra). Không có bảng tra `uuid → callId` phía client
 * (README p2-02 §4.1 "Bảng uuid ↔ callId" nói tính lại được bằng `call-uuid.ts` — nhưng BE đã tính sẵn và gửi thẳng
 * `callUuid` trong `CallDto`/`IncomingCallView`, nên so khớp trực tiếp giá trị đó là đủ, không cần tính lại).
 */
function trackedCallUuid(): string | null {
  const state = callStoreApi.get();
  return state.call?.callUuid ?? state.incoming?.callUuid ?? null;
}

/**
 * Nối sự kiện CallKit (iOS) / self-managed `ConnectionService` (Android) vào hành động cuộc gọi có sẵn
 * (`../hooks/call-actions.ts`). Trả hàm HUỶ ĐĂNG KÝ tất cả listener — gọi khi `CallNativeBridge` unmount (thực tế
 * gần như không xảy ra: component sống suốt vòng đời `(app)`, nhưng vẫn dọn cho đúng vòng đời).
 */
export function bindCallKeepEvents(queryClient: QueryClient): () => void {
  const listeners = [
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      void (async () => {
        if (trackedCallUuid() !== callUUID) {
          // App vừa cold-start TỪ CHÍNH CallKit (native đã tự hiện UI trước khi JS kịp lên) — `callStore` chưa có
          // `callId` ứng với `callUUID` này, và KHÔNG suy ngược được phía client (BE không có endpoint tra theo
          // `callUuid`). `useCallSignals` đồng bộ `/me/active-call` khi socket kết nối/app active, chạy song song —
          // đợi một nhịp rồi thử lại ĐÚNG MỘT LẦN; không được thì bỏ qua (log warn), không crash.
          await sleep(ANSWER_UUID_WAIT_MS);
        }
        if (trackedCallUuid() !== callUUID) {
          logger.warn('[callkeep] answerCall: callStore chưa kịp đồng bộ callUuid, bỏ qua', callUUID);
          return;
        }
        void answerCallAction(queryClient); // tự no-op nếu `phase !== 'incoming'` (xem call-actions.ts)
      })();
    }),

    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      if (trackedCallUuid() !== callUUID) return; // không phải cuộc gọi đang theo dõi — không có gì để kết thúc phía JS
      void hangUp(queryClient); // tự chọn decline/cancel/leave theo phase hiện tại
    }),

    RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted }) => {
      void getCallMedia()
        .setMicrophoneEnabled(!muted)
        .then((micOn) => useCallMediaStore.getState().patch({ micOn }));
    }),

    // iOS: LiveKit tự kích hoạt audio session lúc `connect()` (`core/media/livekit-loader.ts#startCallAudio`, gọi từ
    // adapter media — không nằm trong phạm vi các file `native/*` này). Hai sự kiện dưới KHÔNG cần hành động thêm ở
    // bản này — chỉ log để có dấu vết khi gỡ lỗi "hai lớp audio tranh nhau" (README p2-02 §10).
    RNCallKeep.addEventListener('didActivateAudioSession', () => {
      logger.debug('[callkeep] didActivateAudioSession');
    }),
    RNCallKeep.addEventListener('didDeactivateAudioSession', () => {
      logger.debug('[callkeep] didDeactivateAudioSession');
    }),
  ];

  return () => listeners.forEach((listener) => listener.remove());
}
