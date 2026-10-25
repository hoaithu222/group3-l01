import { registerNotificationType } from "../../notifications/public";

export const CHAT_EXT_NOTIFICATION_TYPES = {
  /** Tin hẹn giờ không phát được (mất quyền/kênh đóng/tệp lỗi…) — gửi cho TÁC GIẢ. */
  SCHEDULED_FAILED: "scheduled-message.failed",
  /** Nhắc lại tin do CHÍNH người dùng đặt. */
  MESSAGE_REMINDER: "message.reminder",
} as const;

/**
 * Đăng ký loại thông báo (side-effect lúc import routes/job, giống `registerAnnouncementNotificationTypes`). README/be.md ghi `SCHEDULED_MESSAGE_FAILED`/`MESSAGE_REMINDER`/`POLL_CLOSED` —
 * cùng các loại này theo tên chấm-thường của p0-06 (`POLL_CLOSED` là P1, chưa cài). Push trung tính: KHÔNG kèm nội dung tin/tên kênh (kênh có thể riêng tư); app mở đúng chỗ từ `refs`.
 * `message.reminder` `respectMute: "NEVER"` — nhắc do chính người dùng đặt nên vẫn tới dù họ tắt tiếng kênh; `personal` — đích danh, không bị chế độ "chỉ nhắc tên" lọc.
 */
export function registerChatExtensionsNotificationTypes(): void {
  registerNotificationType({
    type: CHAT_EXT_NOTIFICATION_TYPES.SCHEDULED_FAILED,
    inbox: true,
    inboxFilter: "all",
    pushType: CHAT_EXT_NOTIFICATION_TYPES.SCHEDULED_FAILED,
    androidChannel: "default",
    priority: 65,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["scheduledMessageId"],
      collapseKey: (refs) => `scheduled-message.failed:${String(refs["scheduledMessageId"] ?? "-")}`,
      template: () => ({ title: "Tin hẹn giờ chưa gửi được", body: "Một tin nhắn hẹn giờ của bạn không thể gửi. Mở ứng dụng để xem chi tiết." }),
    },
  });
  registerNotificationType({
    type: CHAT_EXT_NOTIFICATION_TYPES.MESSAGE_REMINDER,
    inbox: true,
    inboxFilter: "all",
    pushType: CHAT_EXT_NOTIFICATION_TYPES.MESSAGE_REMINDER,
    androidChannel: "default",
    priority: 70,
    respectMute: "NEVER",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["reminderId", "messageId", "scopeType", "scopeId", "unavailable"],
      collapseKey: (refs) => `message.reminder:${String(refs["reminderId"] ?? "-")}`,
      template: () => ({ title: "Nhắc lại tin nhắn", body: "Bạn có một lời nhắc tin nhắn." }),
    },
  });
}
