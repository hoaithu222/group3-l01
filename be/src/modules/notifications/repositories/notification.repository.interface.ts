import type {
  NotificationFilter,
  NotificationInboxItem,
  NotificationPreferenceEntity,
  NotificationPushStatus,
  NotificationScopeType,
  PreferenceMode,
  PreferenceScope,
  QuietHours,
  UpsertPreferenceInput,
} from "../entities/notification.interface";

export interface ListInboxParams {
  filter: NotificationFilter;
  workspaceId?: string;
  unreadOnly: boolean;
  cursor?: string;
  limit: number;
}

export interface MarkAllReadParams {
  filter: NotificationFilter;
  workspaceId?: string;
  before: Date;
}

export interface UnreadCountResult {
  total: number;
  byFilter: { mentions: number; following: number; calls: number; meetings: number };
}

/** Notification (không kèm quan hệ) — dùng bởi `delivery.policy.ts`/`push.jobs.ts`. */
export interface NotificationRow {
  id: string;
  type: string;
  scopeType: NotificationScopeType;
  scopeId: string | null;
  workspaceId: string | null;
  actorId: string | null;
  refs: Record<string, unknown> | null;
}

export interface RecipientRow {
  id: string;
  notificationId: string;
  recipientId: string;
  kind: string;
  inInbox: boolean;
  scopeType: NotificationScopeType;
  scopeId: string | null;
  workspaceId: string | null;
  readAt: Date | null;
  pushStatus: NotificationPushStatus;
  createdAt: Date;
  skipReason?: string | null;
  /** p1-07 — bucket lọc hộp thư (`NotificationFilter`); dòng cũ (p0-06) có thể thiếu. */
  filterBucket?: string | null;
  streamKey?: string | null;
  streamSeq?: number | null;
}

export interface RecipientWithNotification {
  recipient: RecipientRow;
  notification: NotificationRow;
}

export interface UpdateRecipientDeliveryInput {
  pushStatus?: NotificationPushStatus;
  skipReason?: string | null;
  deliveredPushAt?: Date;
}

export interface INotificationRepository {
  // ── Inbox (be.md §4) ──
  listInbox(userId: string, params: ListInboxParams): Promise<{ data: NotificationInboxItem[]; hasMore: boolean }>;
  markRead(userId: string, recipientId: string): Promise<Date | null>;
  markAllRead(userId: string, params: MarkAllReadParams): Promise<number>;
  unreadCount(userId: string, workspaceId?: string): Promise<UnreadCountResult>;

  // ── Delivery (be.md §5.4/§5.5) ──
  findRecipientWithNotification(notificationId: string, recipientId: string): Promise<RecipientWithNotification | null>;
  findRecipientsByIds(ids: string[]): Promise<RecipientWithNotification[]>;
  updateRecipientDelivery(recipientId: string, input: UpdateRecipientDeliveryInput): Promise<void>;
  /** `push.cancel-scope` (be.md p0-02 §5.4 bước 4) — đánh dấu SKIPPED/REVOKED mọi recipient PENDING của các user này thuộc scope, trả số dòng đã cập nhật. */
  cancelPendingByScope(userIds: string[], scopeType: NotificationScopeType, scopeId: string): Promise<number>;

  // ── p1-07: đọc theo luồng, huỷ khi mất quyền, retention ──
  /** `mark-read-by-stream`: mục CHƯA đọc của luồng (`streamKey`: `"root"` | threadId) có `streamSeq ≤ seq` → `readAt=now`; trả id đã đổi. */
  markReadByStream(userId: string, scopeType: NotificationScopeType, scopeId: string, streamKey: string, seq: number): Promise<string[]>;
  /** Mất quyền: mục CHƯA đọc của các user trong scope → `inInbox=false` + `cancelledAt` (NT-05). */
  cancelUnreadByScope(userIds: string[], scopeType: NotificationScopeType, scopeId: string, at: Date): Promise<number>;
  /** Retention: xoá mục đã đọc/đã huỷ trước `before` + `Notification` không còn người nhận. */
  purgeExpired(before: Date): Promise<{ recipients: number; notifications: number }>;

  // ── Preferences (be.md §3/§4) ──
  getPreference(userId: string, scope: PreferenceScope, scopeKey: string): Promise<NotificationPreferenceEntity | null>;
  listPreferences(userId: string): Promise<NotificationPreferenceEntity[]>;
  upsertPreference(input: UpsertPreferenceInput): Promise<NotificationPreferenceEntity>;
}

export type { PreferenceMode, PreferenceScope, QuietHours };
