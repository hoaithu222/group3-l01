import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p4-03 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` — KHÔNG tự ghi `Notification`). Không gắn scope
 * (`scope: null`) nên `readAction: null`; inbox + push GỘP (`batchable`), tắt được ở cài đặt ACCOUNT. `refs` chỉ chứa id + tên huy hiệu
 * (thông tin công khai của danh mục) — push không lộ nội dung riêng tư.
 */
export const GAMIFICATION_NOTIFICATION_TYPES = {
  LEVEL_UP: "gamification.level-up",
  BADGE_UNLOCKED: "gamification.badge-unlocked",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "push"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: true,
  readAction: null,
};

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerGamificationNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: GAMIFICATION_NOTIFICATION_TYPES.LEVEL_UP,
    pushType: GAMIFICATION_NOTIFICATION_TYPES.LEVEL_UP,
    priority: 2,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `level-up:${str(refs["level"])}`,
      dataKeys: ["level"],
      template: ({ refs }) => ({ title: "Lên cấp!", body: `Bạn đã đạt cấp ${str(refs["level"])}` }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: GAMIFICATION_NOTIFICATION_TYPES.BADGE_UNLOCKED,
    pushType: GAMIFICATION_NOTIFICATION_TYPES.BADGE_UNLOCKED,
    priority: 2,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `badge:${str(refs["badgeId"])}`,
      dataKeys: ["badgeId", "code"],
      template: ({ refs }) => ({ title: "Huy hiệu mới", body: `Bạn vừa nhận huy hiệu ${str(refs["name"])}` }),
    },
  });
}
