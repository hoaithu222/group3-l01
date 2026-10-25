import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { useAppActive } from '@/shared/hooks/useAppActive';

import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroStore } from '../store/pomodoro.store';
import { clockA11yLabel, elapsedRatio, formatClock, medianOffset, remainingMsAt } from '../utils/clock';
import { PHASE_LABEL, isRunning } from '../utils/phase';

const TICK_MS = 250;
/** "Giảm chuyển động" (app.md §7): vòng tiến độ chỉ nhích mỗi 5 s (chữ số vẫn đếm từng giây — đó là nội dung, không phải chuyển động). */
const RING_STEP_MS = 5000;

export interface PomodoroClockState {
  a11yLabel: string;
  /** Phần đã trôi của phase (0..1) cho vòng tiến độ. */
  progress: number;
  remainingMs: number | null;
  /** `MM:SS`. */
  text: string;
}

/**
 * Đồng hồ đếm ngược của phòng — `remaining = phaseEndsAt − (now + offsetServer)`, PAUSED dùng `remainingMs` đã lưu (đóng băng) (app.md §4).
 * ⛔ KHÔNG bao giờ tự chuyển phase ở client: chạm 0 thì dừng ở "00:00" chờ `pomodoro:updated` (mọi người cùng đổi một lúc theo server).
 * Chỉ tick khi phase ĐANG CHẠY và app foreground (ra nền thì dừng; về lại tính lại từ mốc server nên không lệch). Hook ở component nhỏ
 * (`PomodoroClock`) để mỗi nhịp 250 ms chỉ vẽ lại đồng hồ, không vẽ lại cả màn.
 */
export function usePomodoroClock(snapshot: PomodoroSnapshot | undefined, channelId: string): PomodoroClockState {
  const offset = usePomodoroStore((state) => medianOffset(state.offsetSamples[channelId] ?? []));
  const appState = useAppActive();
  const reduceMotion = useReducedMotion();
  const ticking = snapshot !== undefined && isRunning(snapshot.phase) && appState === 'active';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  if (!snapshot) return { a11yLabel: 'Đồng hồ Pomodoro', progress: 0, remainingMs: null, text: formatClock(null) };

  // WAITING chưa có mốc: hiện độ dài vòng tập trung sẽ chạy; ENDED: hết giờ.
  const idleMs = snapshot.phase === 'WAITING' ? snapshot.config.focusMinutes * 60_000 : snapshot.phase === 'ENDED' ? 0 : null;
  const remainingMs = remainingMsAt(snapshot, offset, now) ?? idleMs;
  const total = snapshot.phaseDurationMs ?? idleMs;
  const ringNow = reduceMotion ? Math.floor(now / RING_STEP_MS) * RING_STEP_MS : now;
  const ringRemaining = remainingMsAt(snapshot, offset, ringNow) ?? idleMs;

  return {
    a11yLabel: clockA11yLabel(remainingMs, PHASE_LABEL[snapshot.phase]),
    progress: elapsedRatio(ringRemaining, total),
    remainingMs,
    text: formatClock(remainingMs),
  };
}
