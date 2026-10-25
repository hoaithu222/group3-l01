import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p4-04 (dời lịch theo phụ thuộc). Chuỗi `type` theo quy ước hiện có (chữ thường, dấu chấm); tên kế hoạch
 * `TASK_RESCHEDULED` / `TASK_RESCHEDULE_BATCH_DONE` là khoá hằng ở đây.
 */
export const RESCHEDULE_NOTIFICATION_TYPES = {
  /** Người làm của thẻ bị dời — MỘT thông báo mỗi người mỗi lần dời (gộp N thẻ). */
  TASK_RESCHEDULED: "task.rescheduled",
  /** Người bấm "Dời lịch" — lô nền kết thúc (`DONE`/`PARTIAL`/`FAILED`). */
  TASK_RESCHEDULE_BATCH_DONE: "task.reschedule-batch-done",
} as const;

const asText = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const DAY_SECONDS = 24 * 3600;

/**
 * Loại thông báo của p3-03 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` — KHÔNG tự ghi `Notification`).
 * Quyền đọc kiểm LẠI lúc giao (`readAction`): người bị xoá khỏi nhóm/hạ thành khách giữa lúc tạo và lúc giao → bỏ (REVOKED).
 * Mẫu push tiếng Việt đã có ở `notifications/services/push-templates.vi.ts` (foundation) — `refs.taskTitle` chỉ hiện khi bật xem trước.
 */
const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.board.read",
};

/** Idempotent (registry là `Map.set`) — gọi lúc import consumer (worker) lẫn `registerProjectsModule()` (API đọc hộp thư). */
export function registerTaskNotificationTypes(): void {
  const T = PHASE3_NOTIFICATION_TYPES;
  registerNotificationType({ ...BASE, type: T.TASK_ASSIGNED, pushType: T.TASK_ASSIGNED, priority: 5 });
  registerNotificationType({ ...BASE, type: T.TASK_COMMENT, pushType: T.TASK_COMMENT, priority: 2, batchable: true });
  registerNotificationType({
    ...BASE,
    type: T.TASK_COMMENT_MENTION,
    pushType: T.TASK_COMMENT_MENTION,
    inboxFilter: "mentions",
    androidChannel: "mentions",
    priority: 6,
  });
  registerNotificationType({ ...BASE, type: T.TASK_DUE_SOON, pushType: T.TASK_DUE_SOON, androidChannel: "mentions", priority: 4 });

  // ── p4-04 — module tự khai cách hiển thị push (không sửa bảng lõi `push-templates.vi.ts`). `refs` chỉ có id + số đếm. ──
  const R = RESCHEDULE_NOTIFICATION_TYPES;
  registerNotificationType({
    ...BASE,
    type: R.TASK_RESCHEDULED,
    pushType: R.TASK_RESCHEDULED,
    priority: 4,
    push: {
      ttlSeconds: DAY_SECONDS,
      collapseKey: (refs) => `task-reschedule:${asText(refs["rescheduleId"]) || "-"}`,
      dataKeys: ["boardId", "taskId", "rescheduleId"],
      template: ({ refs, lockScreenPreview }) => ({
        title: "Lịch làm việc của bạn vừa được dời",
        body: lockScreenPreview ? `${asText(refs["count"]) || "Một số"} thẻ của bạn được dời lịch` : undefined,
      }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: R.TASK_RESCHEDULE_BATCH_DONE,
    pushType: R.TASK_RESCHEDULE_BATCH_DONE,
    priority: 3,
    push: {
      ttlSeconds: DAY_SECONDS,
      collapseKey: (refs) => `task-reschedule-batch:${asText(refs["batchId"]) || "-"}`,
      dataKeys: ["boardId", "batchId"],
      template: ({ refs }) => {
        const conflicts = Number(refs["conflictCount"]) || 0;
        const failed = refs["status"] === "FAILED";
        return {
          title: failed ? "Dời lịch không hoàn tất" : "Đã dời lịch xong",
          body: failed ? "Có lỗi khi dời lịch hàng loạt, hãy kiểm tra lại bảng" : `Đã dời ${asText(refs["appliedCount"]) || 0} thẻ${conflicts > 0 ? `, ${conflicts} xung đột` : ""}`,
        };
      },
    },
  });
}
