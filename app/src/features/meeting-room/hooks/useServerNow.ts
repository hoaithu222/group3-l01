import { useEffect, useState } from 'react';

import { useMeetingRoomStore } from '../store/meeting-room.store';

/**
 * "Bây giờ" theo GIỜ SERVER (ms) của phòng họp: `Date.now() + serverOffsetMs` (độ lệch lấy từ `serverNow` của response gần nhất — hai máy
 * lệch đồng hồ vẫn thấy cùng một khoảnh khắc, `02-conventions.md` §2). Tick mỗi giây khi `enabled`; tắt thì đứng yên (không đốt pin để
 * đếm một mốc không ai đang nhìn).
 */
export function useServerNow(enabled = true): number {
  const offset = useMeetingRoomStore((state) => state.serverOffsetMs);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  return tick + offset;
}
