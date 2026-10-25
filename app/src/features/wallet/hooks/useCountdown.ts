import { useEffect, useState } from 'react';

/**
 * Đếm ngược giây còn lại — cho `WALLET_010` (nhắc quá dày, 1 lần/giờ).
 * `start(seconds)` đặt mốc; `remaining` giảm về 0 rồi dừng. Đồng hồ chỉ chạy khi có mốc.
 *
 * ⚠️ `Date.now()` chỉ được gọi trong event handler và trong callback của `setInterval` — không
 * gọi lúc render (không thuần khiết: render lại hai lần cho hai kết quả).
 */
export function useCountdown() {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (target === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [target]);

  const start = (seconds: number) => {
    const current = Date.now();
    setNow(current);
    setTarget(current + seconds * 1000);
  };

  const remaining = target === null ? 0 : Math.max(0, Math.ceil((target - now) / 1000));
  return { remaining, start };
}

/** `3725` → `"62:05"` — phút:giây, vì khoảng chờ tối đa 1 giờ. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
