import type { Action } from "../../../core/permission";

export const NOTIFICATION_SCOPE_TYPES = ["NONE", "WORKSPACE", "CHANNEL", "CONVERSATION", "MEETING", "CALL"] as const;
export type NotificationScopeType = (typeof NOTIFICATION_SCOPE_TYPES)[number];

export const NOTIFICATION_PUSH_STATUSES = ["NONE", "PENDING", "SENT", "SKIPPED", "FAILED"] as const;
export type NotificationPushStatus = (typeof NOTIFICATION_PUSH_STATUSES)[number];

export const PREFERENCE_SCOPES = ["ACCOUNT", "WORKSPACE", "CHANNEL", "CONVERSATION"] as const;
export type PreferenceScope = (typeof PREFERENCE_SCOPES)[number];

export const PREFERENCE_MODES = ["INHERIT", "ALL", "MENTIONS", "MUTED"] as const;
export type PreferenceMode = (typeof PREFERENCE_MODES)[number];

/** Bộ lọc `GET /notifications` (be.md §3/§4). */
export const NOTIFICATION_FILTERS = ["all", "mentions", "following", "calls", "meetings"] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export interface QuietHours {
  tz: string;
  /** "22:00" */
  start: string;
  /** "07:00" */
  end: string;
}

export interface NotificationEntity {
  id: string;
  type: string;
  scopeType: NotificationScopeType;
  scopeId: string | null;
  workspaceId: string | null;
  actorId: string | null;
  sourceType: string;
  sourceId: string;
  refs: Record<string, unknown> | null;
  dedupeKey: string;
  createdAt: Date;
}

export interface NotificationRecipientEntity {
  id: string;
  notificationId: string;
  recipientId: string;
  kind: string;
  inInbox: boolean;
  dedupeKey: string;
  scopeType: NotificationScopeType;
  scopeId: string | null;
  workspaceId: string | null;
  readAt: Date | null;
  seenAt: Date | null;
  pushStatus: NotificationPushStatus;
  skipReason: string | null;
  deliveredPushAt: Date | null;
  createdAt: Date;
}

/** Item trả về `GET /notifications` (be.md §4) — hợp nhất Notification + Recipient. */
export interface NotificationInboxItem {
  id: string;
  type: string;
  kind: string;
  scopeType: NotificationScopeType;
  scopeId: string | null;
  workspaceId: string | null;
  actorId: string | null;
  refs: Record<string, unknown> | null;
  createdAt: Date;
  readAt: Date | null;
  /** Preference hiệu lực tại thời điểm hiển thị là MUTED — hiển thị nhãn "đã tắt tiếng" (be.md PUSH-07). */
  muted: boolean;
  /** Quyền scope hiện tại đã mất (be.md §6 "Ma trận quyền") — client hiện màn trung tính, không hiện nội dung. */
  unavailable: boolean;
  /** p1-07 — id tin/thread lấy từ `refs` (nếu có) để client mở đúng chỗ (`?m=`). */
  threadId?: string | null;
  messageId?: string | null;
  /** p1-07 — người thực hiện (tên hiện tại; `avatarUrl` = URL ảnh ký sẵn bản THUMB, dùng thẳng không cần Bearer; chưa có ảnh → `null`). */
  actor?: { userId: string; name: string; avatarUrl: string | null } | null;
  /** p1-07 — ngữ cảnh TÍNH LÚC ĐỌC, kiểm quyền hiện tại (be.md §4 `InboxItem.context`). */
  context?: InboxItemContext;
}

/** be.md §4 `InboxItem.context` — `available=false` → client hiện "Nội dung không còn khả dụng", KHÔNG có excerpt/tên. */
export interface InboxItemContext {
  available: boolean;
  scopeName?: string;
  excerpt?: string;
  muted: boolean;
}

export interface NotificationPreferenceEntity {
  id: string;
  userId: string;
  scope: PreferenceScope;
  scopeKey: string;
  mode: PreferenceMode;
  mutedUntil: Date | null;
  dndUntil: Date | null;
  quietHours: QuietHours | null;
  lockScreenPreview: boolean;
  /** p1-07 — cài đặt theo loại (ACCOUNT/WORKSPACE); `null`/thiếu = kế thừa/mặc định SystemConfig. */
  directMode?: AccountNotifyMode | null;
  groupMode?: AccountNotifyMode | null;
  channelMode?: AccountNotifyMode | null;
  lockScreenLevel?: LockScreenLevelValue | null;
  sound?: boolean | null;
  updatedAt: Date;
}

/** `NotifyModeAccount` (Prisma) — chế độ theo loại cho ACCOUNT/WORKSPACE (p1-07 be.md §2). */
export const ACCOUNT_NOTIFY_MODES = ["ALL", "MENTIONS_AND_THREADS", "MUTED"] as const;
export type AccountNotifyMode = (typeof ACCOUNT_NOTIFY_MODES)[number];

export const LOCK_SCREEN_LEVELS = ["HIDDEN", "SENDER", "FULL"] as const;
export type LockScreenLevelValue = (typeof LOCK_SCREEN_LEVELS)[number];

export interface UpsertPreferenceInput {
  userId: string;
  scope: PreferenceScope;
  scopeKey: string;
  mode?: PreferenceMode;
  mutedUntil?: Date | null;
  dndUntil?: Date | null;
  lockScreenPreview?: boolean;
  directMode?: AccountNotifyMode | null;
  groupMode?: AccountNotifyMode | null;
  channelMode?: AccountNotifyMode | null;
  lockScreenLevel?: LockScreenLevelValue | null;
  sound?: boolean | null;
}

// ── notify() pipeline (be.md §5.2/§5.3) ──────────────────────────────────────

export interface NotifyRecipientInput {
  userId: string;
  /** Loại hợp nhất — "MENTION" > "FIRST_REPLY" > "THREAD_REPLY" > … (mặc định "DEFAULT"). */
  kind?: string;
}

export interface NotifyScopeInput {
  type: Exclude<NotificationScopeType, "NONE">;
  id: string;
}

export interface NotifyInput {
  type: string;
  actorId?: string;
  scope: NotifyScopeInput | null;
  workspaceId?: string;
  source: { type: string; id: string };
  /** id tham chiếu — KHÔNG chứa nội dung (be.md §2 `refs Json?`). */
  refs?: Record<string, unknown>;
  recipients: NotifyRecipientInput[];
  dedupeKey: string;
  /**
   * (p1-07) Thông báo gắn với 1 TIN trong luồng chat (`key` = `"root"` | threadId, `seq` = seq tin trong luồng đó) →
   * mục hộp thư tự thành ĐÃ ĐỌC khi người nhận đọc tới tin đó (`notifications.mark-read-by-stream`, NT-12).
   * Loại không gắn tin (thẻ công việc, lời mời, cuộc họp…) bỏ trống.
   */
  stream?: { key: string; seq: number };
}

/** Registry đăng ký bởi `notification-types.ts` (be.md §5.2). */
export interface NotificationTypeDef {
  type: string;
  inbox: boolean;
  inboxFilter: Exclude<NotificationFilter, "all"> | "all";
  pushType: string | null;
  androidChannel: "default" | "mentions" | "calls";
  /** Hợp nhất cùng dedupeKey: số lớn thắng. */
  priority: number;
  respectMute: "ALWAYS" | "MENTION_BYPASS" | "NEVER";
  /** Chỉ `call.incoming`. */
  bypassDnd: boolean;
  /** Gộp burst 10s (be.md §5.4 bước 7). */
  batchable: boolean;
  /** Kiểm quyền lúc giao — `null` khi scope chưa có `ScopeResolver` (Phase 0). */
  readAction: Action | null;
  /**
   * (p1-07) `true` → `notify()` bỏ người nhận ĐÃ CHẶN `actorId` (`BlockPort.filterNotificationRecipients` — BLOCK-03) TRƯỚC
   * khi ghi hộp thư/outbox. Mặc định `false` (giữ hành vi các loại có sẵn). Loại do NGƯỜI DÙNG khác gây ra (nhắc tên,
   * bình luận…) nên bật; loại hệ thống/quản trị (lời mời workspace, kiểm duyệt) để tắt.
   */
  respectBlock?: boolean;
  /**
   * (p1-07) `true` → thông báo ĐÍCH DANH người nhận dù gắn với luồng chat (CHANNEL/CONVERSATION): chế độ "chỉ nhắc tên" không lọc,
   * chỉ MUTED/DND/đang xem mới chặn. Loại ở scope khác (WORKSPACE/họp/gọi…) vốn không bị chế độ này lọc nên KHÔNG cần khai.
   * Mặc định: suy từ `inboxFilter` `calls|meetings` (hành vi cũ).
   */
  personal?: boolean;
  /**
   * (p1-07) Cách hiển thị push của loại này — module sở hữu loại tự khai lúc `registerNotificationType`, KHÔNG phải sửa
   * bảng lõi (`push-payload.builder.ts` `TYPE_SPECS`, `push-templates.vi.ts`). Vắng → bảng lõi (nếu có) → FALLBACK.
   */
  push?: NotificationPushPresentation;
}

/** Khai báo hiển thị/định tuyến push của 1 loại thông báo (xem `NotificationTypeDef.push`). */
export interface NotificationPushPresentation {
  /** Thời gian sống của push (giây) — mặc định 3600. */
  ttlSeconds?: number | ((refs: Record<string, unknown>) => number);
  /** Khoá thay thế push cũ cùng loại (Android `tag`/APNs `apns-collapse-id`) — mặc định `notif:<scopeId>` (dễ nuốt push khác nhau cùng scope!). */
  collapseKey?: (refs: Record<string, unknown>, scopeId?: string) => string;
  /** Khoá lấy từ `refs` (ép string) đưa vào `data` push để app mở đúng chỗ — KHÔNG chứa nội dung/tên riêng tư. */
  dataKeys?: string[];
  /**
   * Tiêu đề/nội dung khi KHÔNG gộp. `lockScreenPreview=false` (mặc định) PHẢI trả nội dung trung tính (không lộ tên thẻ/tệp/kênh riêng).
   */
  template?: (ctx: { refs: Record<string, unknown>; lockScreenPreview: boolean; scopeType?: string }) => { title?: string; body?: string };
}
