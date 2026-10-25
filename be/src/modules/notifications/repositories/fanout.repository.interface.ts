import type { MessageScopeType } from "../entities/message-notification.types";
import type { PreviewMention } from "../services/message-preview";

/** Tin nhắn ở mức đủ cho fan-out/push (không kéo cả `Message`). */
export interface FanoutMessage {
  id: string;
  scopeType: MessageScopeType;
  scopeId: string;
  workspaceId: string | null;
  /** `Message.threadId` — reply trong thread (chỉ CHANNEL). */
  threadId: string | null;
  seq: number;
  authorId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  systemType: string | null;
  content: string | null;
  mentions: PreviewMention[];
  attachments: { kind: string; name: string }[];
  deletedAt: Date | null;
  createdAt: Date;
}

export interface FanoutScopeMeta {
  workspaceId: string | null;
  conversationKind?: "DIRECT" | "GROUP";
  /** Tên kênh / tiêu đề nhóm (DIRECT → `null`). */
  name: string | null;
  /** Kênh PRIVATE hoặc nhóm cuộc họp — `FULL` hạ xuống `SENDER`. */
  restricted: boolean;
}

export interface RecipientUpsertRow {
  userId: string;
  kind: string;
  kindRank: number;
  filterBucket: string;
}

export interface RecipientUpsertResult {
  userId: string;
  recipientRowId: string;
  /** Mục mới, hoặc mục đã bị huỷ được khôi phục — phát `notification:created`. */
  created: boolean;
  /** Mục cũ được nâng `kind` (vd THREAD_REPLY → MENTION) — phát lại `notification:created`. */
  upgraded: boolean;
}

export interface UpsertMessageNotificationInput {
  dedupeKey: string;
  type: string;
  scopeType: MessageScopeType;
  scopeId: string;
  workspaceId: string | null;
  actorId: string | null;
  messageId: string;
  threadId: string | null;
  seq: number;
}

export interface UpsertRecipientsInput {
  notificationId: string;
  dedupeKey: string;
  scopeType: MessageScopeType;
  scopeId: string;
  workspaceId: string | null;
  streamKey: string;
  streamSeq: number;
  rows: RecipientUpsertRow[];
}

export interface ExistingRecipientRow {
  id: string;
  userId: string;
  kind: string;
  kindRank: number;
  readAt: Date | null;
  deliveredPushAt: Date | null;
  inInbox: boolean;
}

/** Dữ liệu fan-out + push tin nhắn (be.md §5.4–§5.7) — mọi truy cập Prisma của pipeline này. */
export interface IFanoutRepository {
  findMessage(id: string): Promise<FanoutMessage | null>;
  loadScopeMeta(scopeType: MessageScopeType, scopeId: string): Promise<FanoutScopeMeta | null>;
  loadUserNames(userIds: string[]): Promise<Map<string, string>>;

  /** `Notification` gốc — MỘT bản/tin (`dedupeKey = "msg:<messageId>"`), trả id. */
  upsertMessageNotification(input: UpsertMessageNotificationInput): Promise<string>;
  upsertRecipients(input: UpsertRecipientsInput): Promise<RecipientUpsertResult[]>;
  findRecipientRows(dedupeKey: string, userIds: string[]): Promise<ExistingRecipientRow[]>;
  /** Mọi mục hộp thư của 1 tin (dùng khi sửa tin gỡ `@all`). */
  listRecipientRows(dedupeKey: string): Promise<ExistingRecipientRow[]>;
  /** `inInbox=false` + `cancelledAt` (mất quyền / gỡ mention). */
  cancelRecipients(ids: string[], at: Date): Promise<void>;
  /** Ghi kết quả push lên mục hộp thư (nếu có) — `updateMany` theo `(recipientId, dedupeKey)`, không có thì bỏ qua. */
  setPushOutcome(
    dedupeKey: string,
    userId: string,
    outcome: { status: "SENT" | "SKIPPED" | "FAILED"; skipReason?: string; deliveredPushAt?: Date }
  ): Promise<void>;

  /** Mốc đọc hiện tại của người nhận trong luồng (thread → `ReadState THREAD`; kênh → `ReadState CHANNEL`; hội thoại → member). */
  getLastReadSeq(userId: string, scopeType: MessageScopeType, scopeId: string, threadId: string | null): Promise<number>;
  /** Số tin chưa đọc trong luồng (tối đa `cap`) — dùng cho push gộp ("N tin nhắn mới"). */
  countUnreadInStream(
    userId: string,
    scopeType: MessageScopeType,
    scopeId: string,
    threadId: string | null,
    cap: number
  ): Promise<number>;
}
