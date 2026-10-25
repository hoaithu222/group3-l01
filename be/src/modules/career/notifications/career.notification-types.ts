import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p6-06 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` trong transaction cấp/thu hồi). Không gắn scope
 * (`scope: null`); `refs` chỉ có id + mã/tên kỹ năng (danh mục công khai) — push không lộ minh chứng hay tên nhóm. Thu hồi dùng câu trung tính.
 */
export const CAREER_NOTIFICATION_TYPES = {
  SKILL_UNLOCKED: "career.skill-unlocked",
  SKILL_REVOKED: "career.skill-revoked",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "push" | "batchable"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  readAction: null,
};

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerCareerNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: CAREER_NOTIFICATION_TYPES.SKILL_UNLOCKED,
    pushType: CAREER_NOTIFICATION_TYPES.SKILL_UNLOCKED,
    priority: 2,
    batchable: true,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `skill:${str(refs["skillId"])}`,
      dataKeys: ["skillId", "code"],
      template: ({ refs }) => ({ title: "Huy hiệu kỹ năng mới", body: `Bạn vừa đạt huy hiệu kỹ năng xác thực ${str(refs["name"])}` }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: CAREER_NOTIFICATION_TYPES.SKILL_REVOKED,
    pushType: CAREER_NOTIFICATION_TYPES.SKILL_REVOKED,
    priority: 2,
    batchable: false,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `skill-revoked:${str(refs["skillId"])}`,
      dataKeys: ["skillId", "code"],
      template: ({ refs }) => ({ title: "Huy hiệu kỹ năng", body: `Huy hiệu ${str(refs["name"])} đã được thu hồi sau rà soát` }),
    },
  });
}
