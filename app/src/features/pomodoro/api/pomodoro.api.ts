/** Đường dẫn endpoint của `pomodoro` (BE `pomodoro.routes.ts`, p5-02 be.md §4) và hai endpoint của lõi `calls` dùng lại cho media. */

export const pomodoroPath = (channelId: string): string => `/channels/${channelId}/pomodoro`;
export const pomodoroCommandPath = (channelId: string, kind: string): string => `/channels/${channelId}/pomodoro/${kind}`;
export const pomodoroConfigPath = (channelId: string): string => `/channels/${channelId}/pomodoro/config`;
export const pomodoroGoalPath = (channelId: string): string => `/channels/${channelId}/pomodoro/goal`;
export const pomodoroJoinPath = (channelId: string): string => `/channels/${channelId}/pomodoro/join`;
export const pomodoroResultPath = (channelId: string, sessionId: string): string =>
  `/channels/${channelId}/pomodoro/sessions/${sessionId}/summary`;
export const POMODORO_HISTORY_PATH = '/me/pomodoro/history';

/** Rời phòng / gia hạn token chạy theo `callId` ở lõi `calls` (không kiểm loại kênh) — Pomodoro không có endpoint riêng cho hai việc này. */
export const callLeavePath = (callId: string): string => `/calls/${callId}/leave`;
export const callTokenPath = (callId: string): string => `/calls/${callId}/token`;
