import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p4-02 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` — KHÔNG tự ghi `Notification`).
 * Không gắn scope (`scope: null`) nên `readAction: null`; `refs` chỉ chứa id/số đếm — push KHÔNG lộ nội dung bộ học.
 * Loại `SR_DUE_REMINDER` tắt được ở cài đặt ACCOUNT (preference engine); `MOCK_AUTO_SUBMITTED` vào hộp thư + push.
 */
export const STUDY_NOTIFICATION_TYPES = {
  /** "Bạn có N thẻ cần ôn hôm nay" — 07:00 giờ địa phương, gộp một thông báo/người/ngày. */
  SR_DUE_REMINDER: "study.sr-due-reminder",
  /** "Bài thi đã tự nộp" — chỉ khi job hết giờ nộp hộ. */
  MOCK_AUTO_SUBMITTED: "study.mock-auto-submitted",
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
export function registerStudyNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: STUDY_NOTIFICATION_TYPES.SR_DUE_REMINDER,
    pushType: STUDY_NOTIFICATION_TYPES.SR_DUE_REMINDER,
    priority: 2,
    push: {
      ttlSeconds: 6 * 3600,
      collapseKey: () => "study-sr-due",
      dataKeys: ["dueCount", "localDate"],
      template: ({ refs }) => ({ title: "Đến giờ ôn tập", body: `Bạn có ${str(refs["dueCount"])} thẻ cần ôn hôm nay` }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: STUDY_NOTIFICATION_TYPES.MOCK_AUTO_SUBMITTED,
    pushType: STUDY_NOTIFICATION_TYPES.MOCK_AUTO_SUBMITTED,
    priority: 3,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `mock-auto:${str(refs["attemptId"])}`,
      dataKeys: ["attemptId", "setId"],
      template: () => ({ title: "Bài thi đã tự nộp", body: "Hết giờ làm bài — bài thi thử của bạn đã được nộp tự động" }),
    },
  });
}
