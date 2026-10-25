import { registerNotificationType } from "../../notifications/public";

export const AUTH_NOTIFICATION_TYPES = {
  /** Tài khoản vừa đăng nhập từ một thiết bị chưa quen. */
  NEW_DEVICE: "auth.new-device",
} as const;

/** Push TRUNG TÍNH: không IP/tên máy — màn hình khoá có thể bị người khác nhìn thấy. */
export const NEW_DEVICE_PUSH_TEXT = {
  title: "Đăng nhập từ thiết bị mới",
  body: "Nếu không phải bạn, hãy vào Phiên đăng nhập để đăng xuất máy lạ và đổi mật khẩu.",
} as const;

/**
 * Đăng ký loại thông báo (side-effect lúc import — gọi ở CẢ API `router.ts` lẫn worker `worker-registries.ts`, worker cần để giao push).
 * Cảnh báo bảo mật: `respectMute: "NEVER"` (không bị tắt tiếng chặn), `personal` (đích danh). Không `bypassDnd` (chỉ dành cho cuộc gọi).
 */
export function registerAuthNotificationTypes(): void {
  registerNotificationType({
    type: AUTH_NOTIFICATION_TYPES.NEW_DEVICE,
    inbox: true,
    inboxFilter: "all",
    pushType: AUTH_NOTIFICATION_TYPES.NEW_DEVICE,
    androidChannel: "default",
    priority: 90,
    respectMute: "NEVER",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    personal: true,
    push: {
      dataKeys: ["deviceId"],
      collapseKey: (refs) => `auth.new-device:${String(refs["deviceId"] ?? "-")}`,
      template: () => ({ ...NEW_DEVICE_PUSH_TEXT }),
    },
  });
}
