import { registerNotificationType } from "../../notifications/public";

/**
 * Loại thông báo của cuộc gọi (p2-01 be.md §7). `call.incoming`/`call.missed` đã đăng ký sẵn ở lõi (p0-06,
 * `registerBuiltinNotificationTypes`); `call.cancelled` và `call.answered-elsewhere` là push data-only (không hộp thư)
 * dùng để dừng chuông trên thiết bị — bảng push (`push-payload.builder.ts`) đã có TTL 60 s + `collapseKey call:<id>`.
 * Gọi lúc import file job (worker) và routes (API) — idempotent (đăng ký lại cùng `type` chỉ ghi đè).
 */
export function registerCallNotificationTypes(): void {
  registerNotificationType({
    type: "call.cancelled",
    inbox: false,
    inboxFilter: "calls",
    pushType: "call.cancelled",
    androidChannel: "calls",
    priority: 10,
    respectMute: "NEVER",
    bypassDnd: true,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "call.answered-elsewhere",
    inbox: false,
    inboxFilter: "calls",
    pushType: "call.answered-elsewhere",
    androidChannel: "calls",
    priority: 10,
    respectMute: "NEVER",
    bypassDnd: true,
    batchable: false,
    readAction: null,
  });
}
