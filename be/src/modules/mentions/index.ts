/**
 * Barrel side-effect của module `mentions` (p1-06) — mirror
 * `modules/threads/index.ts`. `router.ts` gọi `registerMentionsModule()`
 * NGAY SAU khi import `mentions.routes.ts`.
 */
import { registerMentionValidator } from "../../core/permission";
import { MentionService } from "./mention.service";
import { registerRoleMentionNotificationType } from "./role-mention-fanout.service";

export function registerMentionsModule(): void {
  registerMentionValidator(new MentionService());
  // p3-04 — loại thông báo `mention.role`: tiến trình API cần biết loại này để đọc hộp thư; worker đăng ký ở job file.
  registerRoleMentionNotificationType();
}
