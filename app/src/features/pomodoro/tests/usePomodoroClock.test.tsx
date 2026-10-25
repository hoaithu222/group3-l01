import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroClock } from '../hooks/usePomodoroClock';
import { usePomodoroStore } from '../store/pomodoro.store';
import { clockOffset } from '../utils/clock';
import { focusSnapshot, makeSnapshot, SERVER_NOW } from './fixtures';

/**
 * app.md p5-02 §8 (PM-01 logic): `usePomodoroClock` cho CÙNG số còn lại dù đồng hồ máy lệch ±3 phút; PAUSED dùng `remainingMs`; snapshot phase mới đổi
 * nhãn; chạm 0 thì dừng ở "00:00" — KHÔNG tự chuyển phase.
 */

const REMAINING = 12 * 60_000 + 30_000;

beforeEach(() => {
  // Mock AppState của jest-expo có `currentState` là hàm — trên máy thật nó là chuỗi 'active'. Đồng hồ chỉ tick khi app foreground.
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.useFakeTimers();
  usePomodoroStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Máy lệch `skewMs` nhận snapshot đúng lúc `serverNow`: ghi mẫu lệch như `queryFn` làm. */
function deviceWithSkew(snapshot: PomodoroSnapshot, skewMs: number): void {
  jest.setSystemTime(SERVER_NOW + skewMs);
  usePomodoroStore.getState().pushOffset('ch1', clockOffset(snapshot.serverNow));
}

it.each([-180_000, 0, 180_000])('máy lệch %d ms: ra 12:30 và cùng giảm sau 5 giây', async (skew) => {
  const snapshot = focusSnapshot(REMAINING);
  deviceWithSkew(snapshot, skew);
  const { result } = await renderHook(() => usePomodoroClock(snapshot, 'ch1'));
  expect(result.current.text).toBe('12:30');
  expect(result.current.remainingMs).toBe(REMAINING);

  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(result.current.text).toBe('12:25');
});

it('PAUSED dùng `remainingMs` đã lưu và KHÔNG chạy theo thời gian', async () => {
  const paused = focusSnapshot(REMAINING, { phase: 'PAUSED', phaseEndsAt: null, previousPhase: 'FOCUS', remainingMs: 7 * 60_000 });
  deviceWithSkew(paused, 0);
  const { result } = await renderHook(() => usePomodoroClock(paused, 'ch1'));
  expect(result.current.text).toBe('07:00');
  await act(async () => {
    jest.advanceTimersByTime(30_000);
  });
  expect(result.current.text).toBe('07:00');
});

it('nhận snapshot phase mới ⇒ đổi nhãn trợ năng và số', async () => {
  const focus = focusSnapshot(REMAINING);
  deviceWithSkew(focus, 0);
  const { rerender, result } = await renderHook(({ snapshot }: { snapshot: PomodoroSnapshot }) => usePomodoroClock(snapshot, 'ch1'), {
    initialProps: { snapshot: focus },
  });
  expect(result.current.a11yLabel).toBe('Còn khoảng 13 phút, giai đoạn Tập trung');

  const breakPhase = focusSnapshot(5 * 60_000, { phase: 'SHORT_BREAK', phaseDurationMs: 5 * 60_000, rules: { cameraAllowed: true, micAllowed: true, screenShareAllowed: true } });
  await rerender({ snapshot: breakPhase });
  expect(result.current.text).toBe('05:00');
  expect(result.current.a11yLabel).toBe('Còn khoảng 5 phút, giai đoạn Nghỉ ngắn');
});

it('chạm 0 thì dừng ở 00:00 chờ server — không âm, không tự đổi phase', async () => {
  const snapshot = focusSnapshot(3000);
  deviceWithSkew(snapshot, 0);
  const { result } = await renderHook(() => usePomodoroClock(snapshot, 'ch1'));
  await act(async () => {
    jest.advanceTimersByTime(20_000);
  });
  expect(result.current.text).toBe('00:00');
  expect(result.current.remainingMs).toBe(0);
  expect(result.current.progress).toBe(1);
});

it('WAITING hiện độ dài vòng tập trung sẽ chạy; chưa có snapshot hiện --:--', async () => {
  const waiting = makeSnapshot();
  const { result } = await renderHook(() => usePomodoroClock(waiting, 'ch1'));
  expect(result.current.text).toBe('25:00');
  expect(result.current.progress).toBe(0);
  const empty = await renderHook(() => usePomodoroClock(undefined, 'ch1'));
  expect(empty.result.current.text).toBe('--:--');
});
