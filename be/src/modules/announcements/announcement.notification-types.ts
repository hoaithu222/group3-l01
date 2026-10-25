import { registerNotificationType } from "../notifications/public";

export const ANNOUNCEMENT_NOTIFICATION_TYPES = {
  /** Có thông báo cần xác nhận đã đọc — gửi mọi người đọc được kênh (trừ người yêu cầu). */
  REQUIRED: "announcement.required",
  /** Nhắc người CHƯA xác nhận trước hạn (`LIMITS.announcement.remindBeforeHours`). */
  REMINDER: "announcement.reminder",
} as const;

/**
 * Đăng ký loại thông báo (side-effect lúc import routes/job, giống `registerRoleMentionNotificationType`). Tôn trọng tắt tiếng
 * (`respectMute: "ALWAYS"`) nhưng vẫn vào HỘP THƯ (README p5-04 §5) — người tắt tiếng thấy ở hộp thư, không nhận push. Nội dung push
 * trung tính: không lộ tên kênh/nội dung tin (kênh có thể riêng tư); app mở đúng tin từ `channelId` + `messageId` trong `data`.
 */
export function registerAnnouncementNotificationTypes(): void {
  const base = {
    inbox: true,
    inboxFilter: "all" as const,
    androidChannel: "default" as const,
    respectMute: "ALWAYS" as const,
    bypassDnd: false,
    batchable: false,
    readAction: "channel.read" as const,
  };
  registerNotificationType({
    ...base,
    type: ANNOUNCEMENT_NOTIFICATION_TYPES.REQUIRED,
    pushType: ANNOUNCEMENT_NOTIFICATION_TYPES.REQUIRED,
    priority: 70,
    push: {
      dataKeys: ["workspaceId", "channelId", "messageId"],
      collapseKey: (refs) => `announcement.required:${String(refs["messageId"] ?? "-")}`,
      template: () => ({ title: "Thông báo cần xác nhận", body: "Có thông báo mới cần bạn xác nhận đã đọc." }),
    },
  });
  registerNotificationType({
    ...base,
    type: ANNOUNCEMENT_NOTIFICATION_TYPES.REMINDER,
    pushType: ANNOUNCEMENT_NOTIFICATION_TYPES.REMINDER,
    priority: 75,
    push: {
      dataKeys: ["workspaceId", "channelId", "messageId"],
      collapseKey: (refs) => `announcement.reminder:${String(refs["messageId"] ?? "-")}`,
      template: () => ({ title: "Sắp hết hạn xác nhận", body: "Bạn còn một thông báo chưa xác nhận đã đọc." }),
    },
  });
}
