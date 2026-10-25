import { useEffect } from 'react';

import { isNativeRingActive } from '../native/lock-screen-call';
import { lockScreenCallNative } from '../native/lock-screen-call.module';
import { useCallStore } from '../store/call.store';

/**
 * Nhạc chuông + rung cho cuộc gọi ĐẾN khi app ĐANG MỞ.
 *
 * Vì sao cần: `CallPushReceiver` cố ý KHÔNG dựng notification khi app ở tiền cảnh và
 * `CallHost` đã mount (nếu không là hai thứ cùng báo một cuộc gọi). Trước đợt này thì ca đó
 * hoàn toàn IM LẶNG — màn gọi hiện lên mà máy không kêu tiếng nào, người dùng chỉ thấy nếu
 * đang nhìn vào màn hình.
 *
 * ⛔ Hỏi `isNativeRingActive()` trước mỗi lượt: có ca app ở tiền cảnh mà notification VẪN đang
 * đổ chuông (chính `IncomingCallActivity` làm `importance = FOREGROUND`, hoặc cờ `callUiReady`
 * chưa kịp bật lúc JS đang boot). Reo thêm ở JS lúc đó là hai nguồn âm chồng nhau.
 *
 * Dùng nhạc chuông HỆ THỐNG qua native module chứ không phải `expo-audio`: dự án chưa có tài
 * sản âm thanh nào trong `assets/`, mà tiếng "ting" thông báo thì không ai nhận ra là cuộc gọi.
 * Không có module (iOS, Expo Go, dev client cũ) ⇒ no-op, không lỗi.
 */
export function useIncomingRingtone(): void {
  const ringing = useCallStore((state) => state.phase === 'incoming');

  useEffect(() => {
    if (!ringing) return undefined;
    let stopped = false;

    void (async () => {
      // Chuông hệ thống đang kêu rồi thì thôi; `await` nên phải kiểm lại cờ huỷ sau khi về.
      if (await isNativeRingActive()) return;
      if (stopped) return;
      lockScreenCallNative()?.startRingtone();
    })();

    return () => {
      stopped = true;
      lockScreenCallNative()?.stopRingtone();
    };
  }, [ringing]);
}
