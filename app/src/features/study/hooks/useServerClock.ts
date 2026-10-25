import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** `mm:ss` từ số mili-giây còn lại (âm → 00:00). */
export function formatTimeLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Độ lệch đồng hồ `serverNow − Date.now()` tại thời điểm nhận response (app.md p4-02 §2 `useServerClock`).
 * `serverNow` hỏng ⇒ 0 (tin đồng hồ máy còn hơn `NaN` làm đồng hồ đứng).
 */
export function computeClockOffset(serverNow: string, clientNow: number = Date.now()): number {
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? server - clientNow : 0;
}

/** Ảnh chụp lúc NHẬN response: mốc máy `at` và độ lệch tại đúng mốc đó. */
function makeSnapshot(serverNow: string): { at: number; offsetMs: number; serverNow: string } {
  const at = Date.now();
  return { at, offsetMs: computeClockOffset(serverNow, at), serverNow };
}

/** Thời gian còn lại (ms) tới `expiresAt` theo đồng hồ SERVER — có thể âm khi đã quá hạn. */
export function timeLeftMs(expiresAt: string, serverNowMs: number): number {
  return Date.parse(expiresAt) - serverNowMs;
}

/**
 * Đồng hồ theo giờ SERVER: `nowMs = Date.now() + offsetMs`, tick 1 giây. Đồng hồ máy người dùng không đáng tin (chỉnh tay,
 * lệch múi) nên hạn nộp luôn tính theo `serverNow` của response gần nhất.
 *
 * ⚠️ Offset tính LẠI mỗi khi `serverNow` đổi (response mới: refetch lúc quay lại app…) — đóng băng offset ở lần đầu thì
 * đồng hồ trôi dần so với server suốt bài thi dài. Tick dừng khi app không ở foreground (JS timer bị treo dù sao) và
 * bắt nhịp NGAY khi quay lại, để người dùng không thấy giá trị cũ của lúc rời đi.
 */
export function useServerClock(
  serverNow: string,
  enabled = true,
): { nowMs: number; offsetMs: number } {
  const [snapshot, setSnapshot] = useState(() => makeSnapshot(serverNow));
  const [tick, setTick] = useState(0);

  // Đổi `serverNow` ⇒ tính lại offset trong CÙNG lượt vẽ (mẫu "điều chỉnh state khi prop đổi" của React).
  if (snapshot.serverNow !== serverNow) setSnapshot(makeSnapshot(serverNow));

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setTick(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled]);

  // `tick` chưa nhích (0) hoặc cũ hơn lúc nhận response ⇒ lấy mốc nhận response: nhờ vậy không bao giờ lùi/lệch tới 1 giây.
  return { nowMs: Math.max(tick, snapshot.at) + snapshot.offsetMs, offsetMs: snapshot.offsetMs };
}
