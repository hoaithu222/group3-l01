import { useCapabilities } from '@/shell/capabilities';

export interface LimitRange {
  default: number;
  max: number;
  min: number;
}

export interface PomodoroLimits {
  cyclesBeforeLongBreak: LimitRange;
  focusMinutes: LimitRange;
  goalMax: number;
  longBreakMinutes: LimitRange;
  shortBreakMinutes: LimitRange;
}

/** Khớp `LIMITS.pomodoro` của BE — chỉ dùng khi `GET /capabilities` chưa về/thiếu khối này (BE vẫn là nơi chặn cuối). */
export const FALLBACK_LIMITS: PomodoroLimits = {
  cyclesBeforeLongBreak: { default: 4, max: 8, min: 2 },
  focusMinutes: { default: 25, max: 90, min: 5 },
  goalMax: 200,
  longBreakMinutes: { default: 15, max: 60, min: 5 },
  shortBreakMinutes: { default: 5, max: 30, min: 1 },
};

const isRange = (value: unknown): value is LimitRange =>
  typeof value === 'object' &&
  value !== null &&
  ['default', 'max', 'min'].every((key) => typeof (value as Record<string, unknown>)[key] === 'number');

/** Đọc `capabilities.limits.pomodoro` (ép kiểu TẠI CHỖ dùng, có kiểm — `CapabilityLimits` cố ý là `Record<string, unknown>`). */
export function readPomodoroLimits(limits: Record<string, unknown> | undefined): PomodoroLimits {
  const raw = limits?.pomodoro;
  if (typeof raw !== 'object' || raw === null) return FALLBACK_LIMITS;
  const record = raw as Record<string, unknown>;
  const pick = (key: keyof PomodoroLimits): LimitRange => {
    const value = record[key];
    return isRange(value) ? value : (FALLBACK_LIMITS[key] as LimitRange);
  };
  return {
    cyclesBeforeLongBreak: pick('cyclesBeforeLongBreak'),
    focusMinutes: pick('focusMinutes'),
    goalMax: typeof record.goalMax === 'number' ? record.goalMax : FALLBACK_LIMITS.goalMax,
    longBreakMinutes: pick('longBreakMinutes'),
    shortBreakMinutes: pick('shortBreakMinutes'),
  };
}

export function usePomodoroLimits(): PomodoroLimits {
  return readPomodoroLimits(useCapabilities().data?.limits);
}
