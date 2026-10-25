/**
 * @file useNowTick.ts
 * @description Auto-refresh `Date` mỗi `intervalMs` để component re-render bám
 *   theo thời điểm hiện tại (badge "Cập nhật", highlight tháng/năm hiện tại,
 *   countdown, ...). Trả về cả `Date` gốc + `year`/`monthIdx`/`day` đã tách
 *   sẵn để consumer khỏi phải gọi `.getFullYear()` lặp lại.
 */

import { useEffect, useState } from 'react';

export interface NowTick {
  now: Date;
  year: number;
  /** 0..11 (khớp `Date.getMonth()`). */
  monthIdx: number;
  /** 1..31. */
  day: number;
}

/**
 * @param intervalMs — chu kỳ re-render. Default 60_000 (mỗi phút — đủ để bám
 *   theo đổi tháng/năm; đừng < 1000 vì không có UX cần cấp phút).
 */
export function useNowTick(intervalMs = 60_000): NowTick {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return {
    now,
    year: now.getFullYear(),
    monthIdx: now.getMonth(),
    day: now.getDate(),
  };
}
