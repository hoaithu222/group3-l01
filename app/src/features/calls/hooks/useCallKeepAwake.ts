import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { useCallStore } from '../store/call.store';

/** Thẻ riêng của cuộc gọi — `expo-keep-awake` đếm theo thẻ nên không giẫm lên Live Quiz. */
const KEEP_AWAKE_TAG = 'call-video';

/**
 * Giữ màn hình sáng trong cuộc gọi VIDEO.
 *
 * ⛔ Chỉ video, không áp cho cuộc gọi thoại: gọi thoại thì người dùng áp máy vào tai và màn
 * hình PHẢI tắt (hao pin, và má chạm vào nút). Video thì ngược lại — màn tự khoá giữa cuộc
 * gọi là camera tắt theo và người kia thấy màn đen, đúng lỗi "gọi video hay tự rụng hình".
 *
 * Chỉ bật ở pha thật sự đang gọi (`connecting`/`active`), không bật lúc còn đổ chuông: chuông
 * đã có `turnScreenOn` của `IncomingCallActivity` lo phần đánh thức màn hình.
 */
export function useCallKeepAwake(): void {
  const active = useCallStore((state) => {
    const live = state.phase === 'connecting' || state.phase === 'active';
    const kind = state.call?.mediaKind ?? state.incoming?.mediaKind ?? 'AUDIO';
    return live && kind === 'VIDEO';
  });

  useEffect(() => {
    if (!active) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [active]);
}
