/** Khoá cache `pomodoro` (app.md p5-02 §2). */
export const pomodoroKeys = {
  all: ['pomodoro'] as const,
  history: () => ['pomodoro', 'history'] as const,
  result: (channelId: string, sessionId: string) => ['pomodoro', 'result', channelId, sessionId] as const,
  snapshot: (channelId: string) => ['pomodoro', 'snapshot', channelId] as const,
};
