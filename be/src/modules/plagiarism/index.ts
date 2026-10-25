/**
 * Barrel của module `plagiarism` (p7-05 — quét trùng lặp nội bộ). `registerPlagiarismModule()` — side-effect boot, gọi ở
 * CẢ API (`router.ts`) lẫn worker (đầu `jobs/plagiarism-fingerprint.job.ts`) — đăng ký loại thông báo
 * `plagiarism.scan-completed|failed` (worker cần để giao thông báo/push), cùng mẫu `modules/burnout/index.ts`.
 */
import { registerPlagiarismNotificationTypes } from "./services/plagiarism-notification-types";

export function registerPlagiarismModule(): void {
  registerPlagiarismNotificationTypes();
}
