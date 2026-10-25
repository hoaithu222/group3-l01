import { useCallback, useEffect, useState } from 'react';

export interface RetryCountdown {
  /** Giây còn phải chờ; 0 = được thử lại. */
  remaining: number;
  /** Bắt đầu đếm ngược từ `seconds` (thường `Retry-After` của 429). */
  start: (seconds: number) => void;
}

/**
 * Đếm ngược để khoá nút gửi sau lỗi 429 (app.md p3-04 §3: "429 đếm ngược").
 *
 * Giữ MỐC THỜI GIAN (`deadline`) chứ không giữ số giây còn lại trong state: đếm
 * bằng `setState(prev - 1)` trong `setInterval` lệch dần khi app bị treo nền, còn
 * so với mốc thì luôn đúng. `setState` chỉ gọi trong sự kiện/interval, không gọi
 * đồng bộ trong effect (`react-hooks/set-state-in-effect`).
 */
export function useRetryCountdown(): RetryCountdown {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setDeadline(current + seconds * 1000);
  }, []);

  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return { remaining, start };
}
