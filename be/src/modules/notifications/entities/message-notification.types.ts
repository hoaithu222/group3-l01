/**
 * Kiểu dùng chung cho pipeline thông báo TIN NHẮN (p1-07 be.md §5.3–§5.6) — fan-out, quyết định push,
 * gộp cửa sổ, payload. Tách khỏi `notification.interface.ts` (p0-06, pipeline `notify()`/`deliver.recipient`).
 */

/** Lý do một người nhận được sự chú ý cho 1 tin. Ưu tiên (cao → thấp): MENTION > FIRST_REPLY > THREAD_REPLY > MESSAGE. */
export type FanoutReason = "MENTION" | "FIRST_REPLY" | "THREAD_REPLY" | "MESSAGE";

/** Cùng thang điểm với `KIND_PRIORITY` của `notify()` (p0-06) — `NotificationRecipient.kindRank` so sánh được giữa hai nguồn. */
export const REASON_RANK: Record<FanoutReason, number> = {
  MENTION: 100,
  FIRST_REPLY: 80,
  THREAD_REPLY: 60,
  MESSAGE: 0,
};

/** `MESSAGE` không tạo mục hộp thư (chỉ unread + push nếu chế độ cho phép). */
export function isAttentionReason(reason: FanoutReason): boolean {
  return reason !== "MESSAGE";
}

/** Loại push (`data.type`) theo lý do — khớp `push-payload.builder.ts` TYPE_SPECS và kênh Android `default`/`mentions`. */
export const PUSH_TYPE_BY_REASON: Record<FanoutReason, "message.new" | "mention" | "thread.reply"> = {
  MENTION: "mention",
  FIRST_REPLY: "thread.reply",
  THREAD_REPLY: "thread.reply",
  MESSAGE: "message.new",
};

/** `NotificationRecipient.kind` lưu chuỗi theo `KIND_PRIORITY` của `notify()` (MENTION/FIRST_REPLY/THREAD_REPLY/DEFAULT). */
export const KIND_BY_REASON: Record<FanoutReason, string> = {
  MENTION: "MENTION",
  FIRST_REPLY: "FIRST_REPLY",
  THREAD_REPLY: "THREAD_REPLY",
  MESSAGE: "DEFAULT",
};

/** Chế độ hiệu lực sau khi hợp nhất mọi cấp (khớp `EffectivePreference.mode` của p0-06). */
export type EffectiveMode = "ALL" | "MENTIONS" | "MUTED";

export type LockScreenLevel = "HIDDEN" | "SENDER" | "FULL";

export type MessageScopeType = "CHANNEL" | "CONVERSATION";

/** Ngữ cảnh luồng của 1 tin — đủ để tính ma trận cài đặt và dựng `scopeKey`. */
export interface FanoutScopeContext {
  scopeType: MessageScopeType;
  scopeId: string;
  workspaceId: string | null;
  /** Chỉ CONVERSATION. */
  conversationKind?: "DIRECT" | "GROUP";
}

/** `scopeKey = scopeType:scopeId[:threadId]` — khớp khoá Redis `viewing:*`/`push:win:*` và `scope-key.ts` ở app. */
export function buildScopeKey(scopeType: string, scopeId: string, threadId?: string | null): string {
  return `${scopeType}:${scopeId}${threadId ? `:${threadId}` : ""}`;
}

/** Lý do push bị chặn — nhãn metric `push_suppressed_total{reason}` và số liệu admin. */
export type PushSkipReason =
  | "disabled"
  | "muted"
  | "mode"
  | "dnd"
  | "blocked"
  | "viewing"
  | "read"
  | "revoked"
  | "recalled"
  | "no-token";

/** Việc push 1 tin cho 1 người — dữ liệu vừa đủ để `push.send` dựng lại toàn bộ (không mang nội dung). */
export interface PushTarget {
  userId: string;
  messageId: string;
  scopeType: MessageScopeType;
  scopeId: string;
  threadId: string | null;
  scopeKey: string;
  reason: FanoutReason;
  seq: number;
  authorId: string;
}

/** Payload job `push.send` cho tin nhắn — phân biệt với payload cũ p0-06 (`recipientRowIds`/`batchKey`) bằng `kind`. */
export interface MessagePushJobData extends PushTarget {
  kind: "message";
}

/** Payload job `push.send-coalesced`. */
export interface CoalescedPushJobData {
  kind: "message-coalesced";
  userId: string;
  scopeType: MessageScopeType;
  scopeId: string;
  threadId: string | null;
  scopeKey: string;
  windowStart: number;
}
