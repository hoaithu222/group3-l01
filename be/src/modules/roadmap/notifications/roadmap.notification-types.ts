import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p4-07 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` — KHÔNG tự ghi `Notification`).
 * Mirror `modules/study/notifications/study.notification-types.ts` (`SR_DUE_REMINDER`). Không gắn scope (`scope: null`)
 * nên `readAction: null`; `refs` chỉ chứa id (lessonId/subjectId) + số buổi — KHÔNG tiêu đề/nội dung buổi học.
 */
export const ROADMAP_NOTIFICATION_TYPES = {
  /** "Buổi N đang chờ bạn" — cron `roadmap.remind-today` 07:30 hằng ngày, gộp một thông báo/người/ngày (RM-15). */
  LESSON_DUE_REMINDER: "roadmap.lesson-due-reminder",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "push"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: null,
};

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerRoadmapNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: ROADMAP_NOTIFICATION_TYPES.LESSON_DUE_REMINDER,
    pushType: ROADMAP_NOTIFICATION_TYPES.LESSON_DUE_REMINDER,
    priority: 2,
    push: {
      ttlSeconds: 6 * 3600,
      collapseKey: () => "roadmap-lesson-due",
      dataKeys: ["lessonId", "subjectId", "lessonNumber"],
      template: ({ refs }) => ({ title: "Đến giờ học", body: `Buổi ${str(refs["lessonNumber"])} đang chờ bạn hoàn thành` }),
    },
  });
}
