import { useCallback, useEffect } from 'react';

import { callNative } from '../native/lock-screen-call.module';
import { useCallMediaStore } from '../store/call-media.store';
import { useCallStore } from '../store/call.store';

/**
 * Bật/tắt foreground service của cuộc gọi (Android) — xem `plugins/call-notification/CallForegroundService.kt`.
 *
 * ⛔ Vì sao bắt buộc: từ Android 11 (micro) / 12 (camera), app ở NỀN không được đọc micro/camera
 * nữa trừ khi có foreground service khai đúng kiểu. Thiếu nó thì đang gọi mà bấm Home là người
 * kia **mất tiếng, mất hình** — mà LiveKit vẫn báo "connected" nên không có lỗi nào hiện ra.
 *
 * Bật khi media ĐÃ NỐI XONG (không sớm hơn): Android 14 chỉ cho bật service kiểu
 * `microphone`/`camera` khi app đang ở tiền cảnh VÀ quyền runtime đã được cấp — cả hai chỉ chắc
 * chắn đúng sau khi `connectCallSession` xin quyền và nối thành công.
 */
export function useCallForegroundService(): void {
  const live = useCallStore((state) => state.phase === 'connecting' || state.phase === 'active');
  const connected = useCallMediaStore((state) => state.connection === 'connected');
  // Kiểu `camera` chỉ được khai khi camera THẬT SỰ đang bật; khai thừa là `SecurityException`.
  const camera = useCallMediaStore((state) => state.cameraOn);

  /**
   * Đọc tiêu đề/camera LÚC GỌI chứ không qua dependency: tên cuộc gọi về muộn (sau `ANSWER_OK`)
   * và nếu nó nằm trong deps thì mỗi lần đổi là một vòng dừng-rồi-bật service.
   */
  const start = useCallback(() => {
    const title = useCallStore.getState().call?.scope.title ?? 'Cuộc gọi';
    const withCamera = useCallMediaStore.getState().cameraOn;
    callNative((native) => native.startCallService(title, withCamera));
  }, []);

  useEffect(() => {
    if (!live || !connected) return undefined;
    start();
    return () => callNative((native) => native.stopCallService());
  }, [live, connected, start]);

  /**
   * Camera bật/tắt giữa cuộc gọi ⇒ đổi KIỂU service (`microphone` ↔ `microphone|camera`).
   *
   * ⛔ Gọi `start()` lại trên service ĐANG CHẠY chỉ là một lượt `startForeground` mới — tuyệt
   * đối KHÔNG dừng rồi bật lại: chính cặp stop→start đó sinh ra
   * `ForegroundServiceDidNotStartInTimeException`, thứ giết cả tiến trình app.
   */
  useEffect(() => {
    if (!live || !connected) return;
    start();
  }, [camera, live, connected, start]);
}
