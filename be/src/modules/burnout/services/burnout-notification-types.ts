import { registerNotificationType } from "../../notifications/public";

export const BURNOUT_NOTIFICATION_TYPES = {
  /** Cảnh báo nhẹ sức khoẻ học tập — gửi cho CHÍNH người đã bật theo dõi (README ghi `WELLBEING_ALERT`, cùng loại theo tên chấm-thường của p0-06). */
  ALERT: "wellbeing.alert",
} as const;

/** Nội dung push TRUNG TÍNH: không nhắc "sức khoẻ/kiệt sức/mức rủi ro/điểm" — màn hình khoá có thể bị người khác nhìn thấy, và chính việc có cảnh báo này đã là dữ liệu nhạy cảm. */
export const BURNOUT_ALERT_PUSH_TEXT = { title: "Bạn có một nhắc nhở mới", body: "Mở ứng dụng để xem." } as const;

/**
 * Đăng ký loại thông báo (side-effect lúc import routes/job, giống `registerChatExtensionsNotificationTypes`). `respectMute: "ALWAYS"`, `bypassDnd: false` ⇒ trong giờ yên lặng/DND cảnh báo vẫn vào HỘP THƯ nhưng không push
 * (WELL-05); app hiện toast khi mở lại. `personal` — đích danh, không bị chế độ "chỉ nhắc tên" lọc. Push chỉ mang `assessmentId` (mở đúng màn), không mức/điểm.
 */
export function registerBurnoutNotificationTypes(): void {
  registerNotificationType({
    type: BURNOUT_NOTIFICATION_TYPES.ALERT,
    inbox: true,
    inboxFilter: "all",
    pushType: BURNOUT_NOTIFICATION_TYPES.ALERT,
    androidChannel: "default",
    priority: 40,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["assessmentId"],
      collapseKey: (refs) => `wellbeing.alert:${String(refs["assessmentId"] ?? "-")}`,
      template: () => ({ ...BURNOUT_ALERT_PUSH_TEXT }),
    },
  });
}
