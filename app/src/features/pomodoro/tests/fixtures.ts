import type { PomodoroMyActions, PomodoroSnapshot } from '../api/pomodoro.types';

/** Dữ liệu mẫu THUẦN cho test `pomodoro` (không kéo React/socket) — KHÔNG phải test. */

export const NO_ACTIONS: PomodoroMyActions = {
  canConfigure: false,
  canEnd: false,
  canJoin: true,
  canPause: false,
  canResume: false,
  canSkip: false,
  canStart: false,
};

export const HOST_ID = 'u-host';
export const ME_ID = 'u-me';
export const SERVER_NOW = Date.parse('2026-09-25T10:00:00.000Z');

/** Snapshot mặc định: kênh `ch1` đang WAITING ảo (chưa có phiên), cấu hình 25/5/15 × 4. Ghi đè từng trường theo ca kiểm. */
export function makeSnapshot(over: Partial<PomodoroSnapshot> = {}): PomodoroSnapshot {
  return {
    channelId: 'ch1',
    completedFocusCycles: 0,
    config: { autoAdvance: true, cyclesBeforeLongBreak: 4, focusMinutes: 25, hostCanSpeakInFocus: false, longBreakMinutes: 15, shortBreakMinutes: 5 },
    hostUserId: null,
    myActions: { ...NO_ACTIONS },
    myGoal: null,
    participants: [],
    pauseReason: null,
    phase: 'WAITING',
    phaseDurationMs: null,
    phaseEndsAt: null,
    phaseStartedAt: null,
    previousPhase: null,
    remainingMs: null,
    rules: { cameraAllowed: true, micAllowed: true, screenShareAllowed: true },
    serverNow: new Date(SERVER_NOW).toISOString(),
    sessionId: null,
    skippedFocusCycles: 0,
    v: 1,
    version: 0,
    ...over,
  };
}

/** Snapshot đang chạy FOCUS còn `remainingMs` (tính từ `serverNow`), phiên `s1`. */
export function focusSnapshot(remainingMs: number, over: Partial<PomodoroSnapshot> = {}): PomodoroSnapshot {
  return makeSnapshot({
    hostUserId: HOST_ID,
    phase: 'FOCUS',
    phaseDurationMs: 25 * 60_000,
    phaseEndsAt: new Date(SERVER_NOW + remainingMs).toISOString(),
    phaseStartedAt: new Date(SERVER_NOW + remainingMs - 25 * 60_000).toISOString(),
    remainingMs,
    rules: { cameraAllowed: true, micAllowed: false, screenShareAllowed: true },
    sessionId: 's1',
    version: 2,
    ...over,
  });
}

/** Lỗi axios có cấu trúc `{ error: { code } }` như BE trả (`isAxiosError` nhận ra nhờ cờ `isAxiosError`). */
export function apiErrorLike(status: number, code: string) {
  return Object.assign(new Error(`HTTP ${String(status)}`), {
    isAxiosError: true,
    response: { data: { error: { code, message: code } }, headers: {}, status },
  });
}
