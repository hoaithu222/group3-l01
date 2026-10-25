/**
 * Barrel của module `career` (p6-06 Huy hiệu kỹ năng xác thực; nền cho p6-07 portfolio, p6-08 recruiter board). `registerCareerModule()` — side-effect
 * boot của tiến trình API: loại thông báo `career.skill-unlocked|revoked`. Job/worker tự nối ở `register-jobs.ts` (`jobs/career.jobs.ts`).
 * Module khác dùng `career/public.ts` (không import `services/*`).
 */
import { registerCareerNotificationTypes } from "./notifications/career.notification-types";

export function registerCareerModule(): void {
  registerCareerNotificationTypes();
}
