import { useCallback, useEffect, useState } from 'react';

import { retryAfterSecondsOf } from './to-error-message';

export interface RetryCountdown {
  /** Giây còn phải chờ; `0` = được thử lại. */
  remaining: number;
  /** Đang trong thời gian chờ (`remaining > 0`) — để khoá nút. */
  isWaiting: boolean;
  /** Bắt đầu đếm ngược từ `seconds` (≤ 0 hoặc không hợp lệ = không chờ). */
  start: (seconds: number) => void;
  /** Đọc số giây chờ của lỗi 429 (`retryAfterSecondsOf`) và bắt đầu đếm. Trả `true` nếu lỗi là giới hạn tốc độ. */
  startFromError: (error: unknown) => boolean;
  reset: () => void;
}

/**
 * Đếm ngược để khoá nút sau lỗi 429 — "Thử lại sau 42s" (p0-12; thay ba bản chép trong `members`/`contribution`/`wallet`).
 *
 * ── Thiết kế ─────────────────────────────────────────────────────────────────
 * Giữ MỐC THỜI GIAN (`deadline`) chứ không giữ "số giây còn lại": trừ dần trong `setInterval` lệch khi app bị treo ở
 * nền, còn so với mốc thì luôn đúng. `Date.now()` chỉ được gọi trong sự kiện/interval, ⛔ không trong thân render (React
 * Compiler ghi nhớ kết quả theo đầu vào; `react-hooks/set-state-in-effect` cũng cấm setState đồng bộ trong effect).
 *
 * ```tsx
 * const wait = useRetryCountdown();
 * const send = useMutation({ mutationFn, onError: (error) => wait.startFromError(error) });
 * <Button disabled={wait.isWaiting} label={wait.isWaiting ? `Thử lại sau ${wait.remaining}s` : 'Gửi'} … />
 * ```
 */
export function useRetryCountdown(): RetryCountdown {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (deadline === null) return undefined;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setDeadline(null);
      return;
    }
    const current = Date.now();
    setNow(current);
    setDeadline(current + seconds * 1000);
  }, []);

  const startFromError = useCallback(
    (error: unknown): boolean => {
      const seconds = retryAfterSecondsOf(error);
      if (seconds === undefined) return false;
      start(seconds);
      return true;
    },
    [start],
  );

  const reset = useCallback(() => setDeadline(null), []);

  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return { isWaiting: remaining > 0, remaining, reset, start, startFromError };
}
