import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { useAppActive } from '@/shared/hooks/useAppActive';

export const KEEP_AWAKE_TAG = 'pomodoro-room';

/**
 * Giữ màn hình sáng khi đang trong phòng VÀ app ở foreground (app.md p5-02 §6 — `expo-keep-awake`): màn tự khoá giữa vòng tập trung là
 * người học bị bỏ lại với đồng hồ đen. Ra nền hoặc rời phòng thì nhả ngay — không giữ sáng lâu hơn cần thiết (tốn pin). Module native là
 * phụ thuộc của `expo` nên không đòi dev-client mới.
 */
export function useKeepAwakeInRoom(inRoom: boolean): void {
  const appState = useAppActive();
  const active = inRoom && appState === 'active';

  useEffect(() => {
    if (!active) return undefined;
    // Lỗi kích hoạt (thiết bị/hệ điều hành không cho) không đáng làm hỏng màn phòng: nuốt, màn chỉ có thể tự khoá.
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [active]);
}
