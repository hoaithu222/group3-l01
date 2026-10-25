import { registerNotificationType } from "../../../notifications/public";
import type { NotificationTypeDef } from "../../../notifications/public";

/**
 * Loại thông báo của p4-05 (đăng ký qua `registerNotificationType`, tạo bằng `notify()`). Chuỗi `type` theo quy ước hiện có (chữ thường,
 * dấu chấm/gạch nối); tên kế hoạch `REVIEW_REQUESTED`… là khoá hằng ở đây. `refs` CHỈ có id + tiêu đề thẻ — KHÔNG điểm/nhận xét (be.md §7).
 * Quyền đọc kiểm LẠI lúc giao (`readAction`): người bị loại khỏi nhóm/hạ thành khách giữa lúc tạo và lúc giao → bỏ. Module tự khai cách hiển
 * thị push (không sửa bảng lõi); lock screen mặc định trung tính, chỉ hiện tên thẻ khi người nhận bật xem trước.
 */
export const REVIEW_NOTIFICATION_TYPES = {
  /** Người chấm được giao một thẻ. */
  REQUESTED: "review.requested",
  /** Nhắc người chấm (24 giờ / 72 giờ sau khi được giao — cấu hình `pm.review.reminderHours`). */
  REMINDER: "review.reminder",
  /** Người chấm không còn phải chấm (thẻ rời REVIEW, tắt chấm chéo, bị giao lại thủ công). */
  CANCELLED: "review.cancelled",
  /** Người làm thẻ: có người Yêu cầu sửa. */
  CHANGES_REQUESTED: "review.changes-requested",
  /** Người làm thẻ: đủ duyệt (kể cả tự duyệt do thiếu người chấm). */
  APPROVED: "review.approved",
  /** Người làm thẻ: OWNER/ADMIN miễn chấm. */
  WAIVED: "review.waived",
  /** OWNER/ADMIN: nhóm không đủ người chấm. */
  SHORTAGE: "review.shortage",
} as const;
export type ReviewNotificationType = (typeof REVIEW_NOTIFICATION_TYPES)[keyof typeof REVIEW_NOTIFICATION_TYPES];

const DAY_SECONDS = 24 * 3600;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.board.read",
};

const DATA_KEYS = ["taskId", "boardId", "workspaceId", "roundId"];

function def(type: ReviewNotificationType, priority: number, title: string, body: (taskTitle: string) => string): NotificationTypeDef {
  return {
    ...BASE,
    type,
    pushType: type,
    priority,
    push: {
      ttlSeconds: DAY_SECONDS,
      collapseKey: (refs) => `${type}:${text(refs["roundId"]) || "-"}`,
      dataKeys: DATA_KEYS,
      template: ({ refs, lockScreenPreview }) => ({ title, body: lockScreenPreview && text(refs["taskTitle"]) ? body(text(refs["taskTitle"])) : undefined }),
    },
  };
}

/** Idempotent (registry là `Map.set`) — gọi lúc import consumer (worker) lẫn `registerProjectsModule()` (API đọc hộp thư). */
export function registerReviewNotificationTypes(): void {
  const T = REVIEW_NOTIFICATION_TYPES;
  registerNotificationType(def(T.REQUESTED, 5, "Bạn được giao chấm một thẻ", (t) => `Hãy chấm thẻ “${t}”`));
  registerNotificationType(def(T.REMINDER, 4, "Nhắc chấm thẻ", (t) => `Thẻ “${t}” đang chờ bạn chấm`));
  registerNotificationType(def(T.CANCELLED, 2, "Bạn không còn phải chấm thẻ này", (t) => `Thẻ “${t}” không cần bạn chấm nữa`));
  registerNotificationType(def(T.CHANGES_REQUESTED, 6, "Thẻ của bạn cần sửa", (t) => `Có yêu cầu sửa ở thẻ “${t}”`));
  registerNotificationType(def(T.APPROVED, 4, "Thẻ của bạn đã được duyệt", (t) => `Thẻ “${t}” đã đủ lượt duyệt`));
  registerNotificationType(def(T.WAIVED, 4, "Thẻ của bạn được miễn chấm", (t) => `Thẻ “${t}” được miễn chấm`));
  registerNotificationType(def(T.SHORTAGE, 3, "Nhóm thiếu người chấm", () => "Một số thẻ được duyệt với ít lượt chấm hơn cài đặt"));
}
