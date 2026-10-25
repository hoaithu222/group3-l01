import { useEffect, useState } from 'react';

import { useCallStore } from '../store/call.store';
import { formatClock } from '../utils/call-outcome';

/**
 * Đồng hồ "05:12" của cuộc gọi đang diễn ra, tính theo GIỜ SERVER (`serverOffsetMs`) để hai máy hiện cùng số dù đồng hồ
 * máy lệch. Mốc: `answeredAt` (đã có người nhận), chưa có thì `startedAt`. Chỉ chạy khi `active`.
 */
export function useCallTimer(): string {
  const phase = useCallStore((state) => state.phase);
  const answeredAt = useCallStore((state) => state.call?.answeredAt ?? state.call?.startedAt ?? null);
  const offset = useCallStore((state) => state.serverOffsetMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== 'active') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  if (phase !== 'active' || !answeredAt) return formatClock(0);
  return formatClock((now + offset - Date.parse(answeredAt)) / 1000);
}
