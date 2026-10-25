import type { PomodoroSnapshot } from '../api/pomodoro.types';
import {
  clockA11yLabel,
  clockOffset,
  elapsedRatio,
  formatClock,
  formatSpan,
  medianOffset,
  pushSample,
  remainingMsAt,
} from '../utils/clock';
import { focusSnapshot, makeSnapshot, SERVER_NOW } from './fixtures';

/**
 * PM-01 (logic): hai máy lệch đồng hồ ±3 phút vẫn thấy CÙNG số còn lại — vì đo lệch theo `serverNow` chứ không tin giờ máy.
 */

const REMAINING = 12 * 60_000 + 30_000;

/** Máy có đồng hồ lệch `skewMs` so với server, nhận snapshot đúng lúc `serverNow`. */
function remainingOnDevice(snapshot: PomodoroSnapshot, skewMs: number): number | null {
  const deviceNow = SERVER_NOW + skewMs;
  const offset = clockOffset(snapshot.serverNow, deviceNow);
  return remainingMsAt(snapshot, offset, deviceNow);
}

describe('đồng hồ theo server (PM-01)', () => {
  it.each([-180_000, 0, 180_000])('máy lệch %d ms vẫn ra cùng số còn lại', (skew) => {
    expect(remainingOnDevice(focusSnapshot(REMAINING), skew)).toBe(REMAINING);
  });

  it('sau 5 giây thực trôi qua, cả hai máy lệch cùng giảm đúng 5 giây', () => {
    const snapshot = focusSnapshot(REMAINING);
    const skew = 180_000;
    const offset = clockOffset(snapshot.serverNow, SERVER_NOW + skew);
    expect(remainingMsAt(snapshot, offset, SERVER_NOW + skew + 5000)).toBe(REMAINING - 5000);
  });

  it('PAUSED dùng `remainingMs` đã lưu (đóng băng), bỏ qua đồng hồ', () => {
    const paused = focusSnapshot(REMAINING, { phase: 'PAUSED', phaseEndsAt: null, remainingMs: 7 * 60_000, previousPhase: 'FOCUS' });
    expect(remainingMsAt(paused, 0, SERVER_NOW + 999_999)).toBe(7 * 60_000);
  });

  it('không có mốc (WAITING) ⇒ null; chạm 0 thì dừng ở 0, không âm', () => {
    expect(remainingMsAt(makeSnapshot(), 0, SERVER_NOW)).toBeNull();
    expect(remainingMsAt(focusSnapshot(1000), 0, SERVER_NOW + 60_000)).toBe(0);
  });
});

describe('offset', () => {
  it('trung vị 5 mẫu gần nhất: một mẫu ngoại lai không kéo lệch đồng hồ', () => {
    expect(medianOffset([100, 110, 90, 95, 5000])).toBe(100);
    expect(medianOffset([10, 20])).toBe(15);
    expect(medianOffset([])).toBe(0);
  });

  it('pushSample giữ đúng 5 mẫu mới nhất', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7].reduce<number[]>((acc, value) => pushSample(acc, value), []);
    expect(samples).toEqual([3, 4, 5, 6, 7]);
  });

  it('serverNow hỏng ⇒ offset 0 (rơi về giờ máy, không NaN)', () => {
    expect(clockOffset('không-phải-ngày', 123)).toBe(0);
  });
});

describe('định dạng', () => {
  it('MM:SS làm tròn LÊN theo giây; 0 ra 00:00; null ra --:--', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(24 * 60_000 + 59_200)).toBe('25:00');
    expect(formatClock(59_000)).toBe('00:59');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(null)).toBe('--:--');
  });

  it('nhãn trợ năng đổi mỗi PHÚT, không mỗi giây', () => {
    const label = (ms: number) => clockA11yLabel(ms, 'Tập trung');
    expect(label(12 * 60_000 + 30_000)).toBe('Còn khoảng 13 phút, giai đoạn Tập trung');
    expect(label(12 * 60_000 + 1000)).toBe(label(12 * 60_000 + 30_000));
    expect(label(11 * 60_000 + 59_000)).toBe('Còn khoảng 12 phút, giai đoạn Tập trung');
    expect(label(0)).toBe('Hết giờ, giai đoạn Tập trung');
  });

  it('vòng tiến độ 0..1 và thời gian có mặt dạng chữ', () => {
    expect(elapsedRatio(15 * 60_000, 25 * 60_000)).toBeCloseTo(0.4);
    expect(elapsedRatio(null, 25 * 60_000)).toBe(0);
    expect(elapsedRatio(30 * 60_000, 25 * 60_000)).toBe(0);
    expect(formatSpan(45)).toBe('45 giây');
    expect(formatSpan(12 * 60)).toBe('12 phút');
    expect(formatSpan(85 * 60)).toBe('1 giờ 25 phút');
  });
});
