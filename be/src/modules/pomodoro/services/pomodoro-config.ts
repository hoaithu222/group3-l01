import { LIMITS } from "../../../core/constants/limits";
import type { PomodoroConfig } from "../entities/pomodoro.interface";

interface Range {
  default: number;
  min: number;
  max: number;
}

const L = LIMITS.pomodoro;

const intIn = (raw: unknown, r: Range): number => (typeof raw === "number" && Number.isInteger(raw) && raw >= r.min && raw <= r.max ? raw : r.default);

/** Cấu hình mặc định nền tảng (25/5/15/4, tự chuyển phase, chủ phòng cũng im lặng khi tập trung). */
export function defaultPomodoroConfig(): PomodoroConfig {
  return {
    focusMinutes: L.focusMinutes.default,
    shortBreakMinutes: L.shortBreakMinutes.default,
    longBreakMinutes: L.longBreakMinutes.default,
    cyclesBeforeLongBreak: L.cyclesBeforeLongBreak.default,
    autoAdvance: true,
    hostCanSpeakInFocus: false,
  };
}

/** Đọc cấu hình từ JSON đã lưu (`Channel.settings.pomodoro`, `PomodoroSession.config`): trường thiếu/ngoài khoảng → mặc định, không ném lỗi. */
export function normalizePomodoroConfig(raw: unknown): PomodoroConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = defaultPomodoroConfig();
  return {
    focusMinutes: intIn(o.focusMinutes, L.focusMinutes),
    shortBreakMinutes: intIn(o.shortBreakMinutes, L.shortBreakMinutes),
    longBreakMinutes: intIn(o.longBreakMinutes, L.longBreakMinutes),
    cyclesBeforeLongBreak: intIn(o.cyclesBeforeLongBreak, L.cyclesBeforeLongBreak),
    autoAdvance: typeof o.autoAdvance === "boolean" ? o.autoAdvance : d.autoAdvance,
    hostCanSpeakInFocus: typeof o.hostCanSpeakInFocus === "boolean" ? o.hostCanSpeakInFocus : d.hostCanSpeakInFocus,
  };
}
