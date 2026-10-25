/**
 * Barrel của module `pomodoro` (p5-02). Không có bước "đăng ký lúc khởi động" ở tiến trình API: `pomodoro:updated` phát thẳng bằng `emitToRoom` (chạy được
 * cả ở API lẫn worker nhờ cầu nối `socket.bridge`), còn job/cron/webhook chỉ được nạp ở worker qua `jobs/pomodoro.jobs.ts` (`register-jobs.ts`) —
 * KHÔNG import `router.ts`.
 */
export { createPomodoroContainer, getPomodoroContainer, setPomodoroContainerForTests } from "./pomodoro.container";
export type { PomodoroContainer, PomodoroContainerOverrides } from "./pomodoro.container";
