import type { NotificationTypeDef } from "../entities/notification.interface";

const registry = new Map<string, NotificationTypeDef>();

/**
 * Module đăng ký 1 loại thông báo (side-effect, giống `registerScopeResolver`)
 * — Phase 1+ gọi lúc import routes của module đó (be.md §11 `registerNotificationType`
 * export qua `public.ts`).
 */
export function registerNotificationType(def: NotificationTypeDef): void {
  registry.set(def.type, def);
}

export function getNotificationType(type: string): NotificationTypeDef | undefined {
  return registry.get(type);
}

export function listNotificationTypes(): NotificationTypeDef[] {
  return [...registry.values()];
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearNotificationTypeRegistry(): void {
  registry.clear();
}

/**
 * Phase 0 đăng ký sẵn loại dùng chung (be.md §5.2) — Phase 1 thêm `message.new`,
 * `mention`, `thread.reply`, `conversation.added`, `channel.granted`,
 * `workspace.role-changed`… lúc module đó import routes.
 */
export function registerBuiltinNotificationTypes(): void {
  registerNotificationType({
    type: "system.test",
    inbox: false,
    inboxFilter: "all",
    pushType: "system.test",
    androidChannel: "default",
    priority: 0,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "call.missed",
    inbox: true,
    inboxFilter: "calls",
    pushType: "call.missed",
    androidChannel: "default",
    priority: 5,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "call.incoming",
    inbox: false,
    inboxFilter: "calls",
    pushType: "call.incoming",
    androidChannel: "calls",
    priority: 10,
    respectMute: "NEVER",
    bypassDnd: true,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.invited",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.invited",
    androidChannel: "default",
    priority: 3,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.reminder",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.reminder",
    androidChannel: "mentions",
    priority: 4,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.started",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.started",
    androidChannel: "mentions",
    priority: 4,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.updated",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.updated",
    androidChannel: "default",
    priority: 2,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.cancelled",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.cancelled",
    androidChannel: "default",
    priority: 3,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
  // ── p1-07 — thông báo TIN NHẮN (ghi bởi `FanoutService`, KHÔNG qua `notify()`/`deliver.recipient`):
  // `readAction: null` vì quyền đọc phụ thuộc scope (kênh/hội thoại) và được kiểm lại ở `MessagePushService`
  // ngay trước khi gửi; `batchable` chỉ mang tính khai báo — gộp cửa sổ do `PushDispatchService` làm.
  registerNotificationType({
    type: "message.new",
    inbox: false,
    inboxFilter: "all",
    pushType: "message.new",
    androidChannel: "default",
    priority: 0,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: true,
    readAction: null,
  });
  registerNotificationType({
    type: "mention",
    inbox: true,
    inboxFilter: "mentions",
    pushType: "mention",
    androidChannel: "mentions",
    priority: 100,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: true,
    readAction: null,
  });
  registerNotificationType({
    type: "thread.reply",
    inbox: true,
    inboxFilter: "following",
    pushType: "thread.reply",
    androidChannel: "mentions",
    priority: 60,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: true,
    readAction: null,
  });
  registerNotificationType({
    type: "meeting.recap-published",
    inbox: true,
    inboxFilter: "meetings",
    pushType: "meeting.recap-published",
    androidChannel: "default",
    priority: 1,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
}

// Side-effect lúc import — giống `defineCron`/`registerJob` (đăng ký 1 lần khi
// module `notifications` được nạp, ví dụ qua `notifications.routes.ts`).
registerBuiltinNotificationTypes();
