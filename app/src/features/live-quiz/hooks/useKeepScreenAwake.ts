import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Giữ màn hình sáng trong lúc chơi (app.md p5-01 §6 — `expo-keep-awake`): màn tự khoá giữa câu hỏi là người chơi
 * bị loại khỏi phiên thời gian thực mà không biết vì sao.
 *
 * `active` = phiên đang `IN_PROGRESS` (`SessionScreen` truyền vào). Tắt (hết phiên, rời màn) thì nhả ngay — không giữ
 * sáng màn hình lâu hơn cần thiết, tốn pin.
 *
 * Module native đã có sẵn trong bản dựng (là phụ thuộc của `expo`), nên khai trong `package.json` không đòi dev-client mới.
 */
export const KEEP_AWAKE_TAG = 'live-quiz-session';

export function useKeepScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    // Lỗi kích hoạt (thiết bị/hệ điều hành không cho) không đáng làm hỏng màn chơi: nuốt, màn chỉ có thể tự khoá.
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [active]);
}
