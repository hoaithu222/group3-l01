import { useEffect, useState } from 'react';
import { Text } from 'react-native';

export interface RateLimitCountdownProps {
  /** Epoch ms — mốc được thử lại (`RATE_002.details.retryAfterSeconds`, app.md §4.3/§3). */
  retryAfterAt: number;
  onExpire?: () => void;
}

function secondsLeft(retryAfterAt: number): number {
  return Math.max(0, Math.ceil((retryAfterAt - Date.now()) / 1000));
}

/** 429 → khoá nút Gửi, "Thử lại sau 4 s" đếm ngược (app.md §3). */
export function RateLimitCountdown({ retryAfterAt, onExpire }: RateLimitCountdownProps) {
  const [seconds, setSeconds] = useState(() => secondsLeft(retryAfterAt));

  useEffect(() => {
    // ⚠️ KHÔNG gọi `setSeconds` đồng bộ ngay đầu effect (React Compiler
    // `react-hooks/set-state-in-effect` chặn) — `useState(() => …)` đã đúng cho
    // lần mount đầu; đổi `retryAfterAt` giữa chừng thì đợi nhịp `setInterval`
    // ĐẦU TIÊN cập nhật lại (≤ 250ms, không cảm nhận được trên một đồng hồ đếm giây).
    const timer = setInterval(() => {
      const left = secondsLeft(retryAfterAt);
      setSeconds(left);
      if (left <= 0) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [retryAfterAt, onExpire]);

  if (seconds <= 0) return null;
  return <Text className="text-label-xs text-error">Thử lại sau {seconds}s</Text>;
}
