import { useEffect, useState } from 'react';

import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

/**
 * Giờ SERVER (ms) giữ trong STATE, cập nhật mỗi `intervalMs` — "Tự xoá sau N ngày" tính từ đây. ⛔ Không đọc `serverNowMs()` trong thân
 * render: React Compiler ghi nhớ kết quả theo đầu vào và số ngày sẽ đứng yên (xem `announcements/hooks/useIsExpired.ts`).
 */
export function useServerClock(intervalMs = 60_000): number {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNowMs()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
