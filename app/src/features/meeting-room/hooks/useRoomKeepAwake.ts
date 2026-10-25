import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const MEETING_KEEP_AWAKE_TAG = 'meeting-room';

/**
 * Giữ màn hình sáng khi đang trong phòng họp (`IN_ROOM`/`RECONNECTING`, app.md §6): màn tự khoá giữa cuộc họp là mất hình và dễ bị ngắt
 * âm thanh. Nhả ngay khi rời phòng — không giữ sáng lâu hơn cần thiết. Lỗi kích hoạt/nhả (thiết bị không cho, Activity đã huỷ) thì nuốt:
 * `deactivateKeepAwake` cũng trả Promise, để `void` trần thì lỗi thành "unhandled rejection".
 */
export function useRoomKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    void activateKeepAwakeAsync(MEETING_KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(MEETING_KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [active]);
}
