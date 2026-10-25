import { registerNotificationType } from "../notifications/public";
import type { NotificationTypeDef } from "../notifications/public";

/**
 * Loại thông báo của p1-08 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` — KHÔNG tự ghi
 * `Notification`). Tất cả CHỈ vào hộp thư (`pushType: null`) và KHÔNG mang nội dung tin/danh tính người
 * báo cáo (`refs` chỉ chứa id + lý do do người kiểm duyệt nhập). `readAction: null` — người nhận đã được
 * chọn theo vai trò LÚC tạo; nội dung nhạy cảm không nằm trong thông báo nên không cần kiểm lại lúc giao.
 */
const BASE: Omit<NotificationTypeDef, "type" | "priority"> = {
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: null,
};

export const MODERATION_NOTIFICATION_TYPES = {
  /** Người xử lý phạm vi: có báo cáo mới cần xem (`MODERATION_REQUEST`). */
  REQUEST: "moderation.request",
  /** Người báo cáo: "Báo cáo của bạn đã được xử lý" (không chi tiết). */
  REPORT_RESOLVED: "moderation.report-resolved",
  /** Tác giả: "Tin nhắn của bạn đã bị gỡ vì …". */
  CONTENT_REMOVED: "moderation.content-removed",
  /** Tác giả: cảnh cáo (`MODERATION_WARNING`), không nêu người báo cáo. */
  WARNING: "moderation.warning",
  /** OWNER workspace / hai người trong 1-1: "Đội kiểm duyệt đã xem nội dung bị báo cáo…" (D-06). */
  PRIVATE_VIEWED: "moderation.private-viewed",
  /** Cron `reports.stale-reminder`: nhóm báo cáo còn OPEN quá `LIMITS.report.staleReminderHours` — nhắc người xử lý phạm vi / quản trị nền tảng. */
  STALE_REMINDER: "moderation.stale-reminder",
} as const;

/** Idempotent (registry là `Map.set`) — gọi lúc import consumer (worker) và route (API), cùng process hay khác process đều an toàn. */
export function registerModerationNotificationTypes(): void {
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.REQUEST, priority: 3 });
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.REPORT_RESOLVED, priority: 1 });
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.CONTENT_REMOVED, priority: 4 });
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.WARNING, priority: 4 });
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.PRIVATE_VIEWED, priority: 4 });
  registerNotificationType({ ...BASE, type: MODERATION_NOTIFICATION_TYPES.STALE_REMINDER, priority: 3 });
}
