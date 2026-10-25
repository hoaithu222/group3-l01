import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p4-06 (đăng ký qua `registerNotificationType`, tạo bằng `notify()`): tên kế hoạch `CONTRIBUTION_EXPORT_READY/FAILED`, chuỗi `type`
 * theo quy ước chữ thường có dấu chấm của codebase. Chỉ hộp thư + push thường; `refs` CHỈ có id (`exportId`, `boardId`, `workspaceId`) — không số liệu,
 * không tên thành viên. Không gắn scope (`scope: null`) nên `readAction: null`; app mở đúng màn nhờ `refs`.
 */
export const CONTRIBUTION_NOTIFICATION_TYPES = {
  EXPORT_READY: "contribution.export-ready",
  EXPORT_FAILED: "contribution.export-failed",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "push"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  priority: 2,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: null,
};

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerContributionNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_READY,
    pushType: CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_READY,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `contribution-export:${str(refs["exportId"])}`,
      dataKeys: ["exportId", "boardId", "workspaceId"],
      template: () => ({ title: "Báo cáo đóng góp đã sẵn sàng", body: "Chạm để mở tệp PDF." }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_FAILED,
    pushType: CONTRIBUTION_NOTIFICATION_TYPES.EXPORT_FAILED,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: (refs) => `contribution-export:${str(refs["exportId"])}`,
      dataKeys: ["exportId", "boardId", "workspaceId"],
      template: () => ({ title: "Không tạo được báo cáo đóng góp", body: "Chạm để thử lại." }),
    },
  });
}
