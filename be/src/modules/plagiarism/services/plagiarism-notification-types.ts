import { registerNotificationType } from "../../notifications/public";
import { PLAGIARISM_NOTIFICATION_TYPES } from "../plagiarism.events";

/**
 * Đăng ký loại thông báo `PLAGIARISM_SCAN_COMPLETED|FAILED` (be.md §5 "Thông báo") — CHỈ gửi cho người yêu cầu quét
 * (`personal: true`), không đích danh vai trò khác. Push trung tính (không nói điểm/mức) — mở đúng màn báo cáo.
 */
export function registerPlagiarismNotificationTypes(): void {
  registerNotificationType({
    type: PLAGIARISM_NOTIFICATION_TYPES.SCAN_COMPLETED,
    inbox: true,
    inboxFilter: "all",
    pushType: PLAGIARISM_NOTIFICATION_TYPES.SCAN_COMPLETED,
    androidChannel: "default",
    priority: 30,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["scanId", "workspaceId"],
      collapseKey: (refs) => `plagiarism.scan:${String(refs["scanId"] ?? "-")}`,
      template: () => ({ title: "Đã có kết quả kiểm tra trùng lặp", body: "Chạm để xem báo cáo." }),
    },
  });
  registerNotificationType({
    type: PLAGIARISM_NOTIFICATION_TYPES.SCAN_FAILED,
    inbox: true,
    inboxFilter: "all",
    pushType: PLAGIARISM_NOTIFICATION_TYPES.SCAN_FAILED,
    androidChannel: "default",
    priority: 30,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["scanId", "workspaceId"],
      collapseKey: (refs) => `plagiarism.scan:${String(refs["scanId"] ?? "-")}`,
      template: () => ({ title: "Lượt kiểm tra trùng lặp không hoàn tất", body: "Chạm để xem chi tiết." }),
    },
  });
}
