import { useEffect, useState } from 'react';

/**
 * Đếm ngược mỗi giây từ `seconds` về 0 (429 `RATE_002` → "thử lại sau 42 giây", app.md §3 "Xuất PDF"). `seconds` mới (`undefined` = không bị giới
 * hạn) đặt lại bộ đếm. Trả `0` khi hết chờ — nút bấm lại được.
 */
export function useRetryCountdown(seconds: number | undefined): number {
  const [remaining, setRemaining] = useState(seconds ?? 0);
  const [seen, setSeen] = useState(seconds);

  // 'Điều chỉnh state trong lúc render' (không effect): đặt lại bộ đếm khi giá trị đầu vào đổi.
  if (seconds !== seen) {
    setSeen(seconds);
    setRemaining(seconds ?? 0);
  }

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return remaining;
}
