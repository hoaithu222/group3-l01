/**
 * Barrel CÔNG KHAI của module `notifications` — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật
 * "modules KHÔNG import chéo module" (`.claude/rules/architecture.md` mục
 * "Shared module services"), giống `@modules/assets/public`/`@modules/devices/public`.
 * Module Phase 1+ tạo thông báo (vd `messages`, `meetings`, `calls`) PHẢI
 * import `notify`/`registerNotificationType` TỪ ĐÂY — KHÔNG tự ghi
 * `Notification`/`NotificationRecipient` hay gọi `getPushSender()` trực tiếp
 * (reuse-first.md).
 */
export { notify, type NotifyResult } from "./services/notify";
export { registerNotificationType, getNotificationType } from "./services/notification-types";
export type {
  NotificationTypeDef,
  NotifyInput,
  NotifyRecipientInput,
  NotifyScopeInput,
  NotificationScopeType,
} from "./entities/notification.interface";

// ── p1-07 ────────────────────────────────────────────────────────────────────
/** Điểm gắn `BlockPort` (p1-08) — xem `services/block-filter.holder.ts`. */
export { setNotificationBlockFilter } from "./services/block-filter.holder";
/** Số liệu tổng hợp cho `GET /admin/notifications/stats` (`modules/admin-notifications`). */
export { readNotificationStats, type NotificationStats, type StatRange } from "./services/notification-stats";
