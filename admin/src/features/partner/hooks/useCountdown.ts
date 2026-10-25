import { useCallback, useEffect, useState } from 'react';

interface CountdownState {
  until: number;
  now: number;
}

/**
 * Đếm ngược theo GIÂY còn lại tới một mốc — dùng cho khoá PIN (`O2O_008`, 15 phút) và giới hạn 429.
 *
 * `start(seconds)` đặt CẢ mốc đến LẪN đồng hồ trong MỘT lần set (trong handler, không phải effect) nên số giây đầu tiên đúng ngay,
 * không nhảy từ giá trị cũ sang giá trị đúng sau nhịp tick đầu. Nhịp 1 giây chỉ chạy khi đang đếm; hết giờ tự trả `null` để tắt nhịp.
 * `remaining` = 0 khi không đếm/đã hết.
 */
export function useCountdown() {
  const [state, setState] = useState<CountdownState | null>(null);
  const active = state !== null;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setState((s) => (s && s.until > now ? { ...s, now } : null));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const start = useCallback((seconds: number) => {
    const now = Date.now();
    setState({ until: now + seconds * 1000, now });
  }, []);

  const remaining = state ? Math.max(0, Math.ceil((state.until - state.now) / 1000)) : 0;
  return { remaining, start };
}
