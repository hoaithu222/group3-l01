import type { PushPayload } from "../../../infrastructure/push";
import {
  PUSH_TYPE_BY_REASON,
  type FanoutReason,
  type LockScreenLevel,
  type MessageScopeType,
} from "../entities/message-notification.types";

export interface BuildMessagePushInput {
  userId: string;
  messageId: string;
  scopeType: MessageScopeType;
  scopeId: string;
  threadId: string | null;
  scopeKey: string;
  reason: FanoutReason;
  workspaceId: string | null;
  /** Chỉ CONVERSATION. */
  conversationKind?: "DIRECT" | "GROUP";
  /** Tên kênh (không kèm `#`) hoặc tiêu đề nhóm; DIRECT không dùng. */
  scopeName: string | null;
  senderName: string | null;
  /** Trích đoạn đã render (`renderMessagePreview`) — chỉ dùng khi hiệu lực là `FULL`. */
  preview: string;
  level: LockScreenLevel;
  /** Kênh PRIVATE / nhóm cuộc họp → `FULL` hạ xuống `SENDER` (không lộ nội dung nơi hạn chế). */
  restricted: boolean;
  /** > 1 → gộp burst ("N tin nhắn mới"). */
  batchCount?: number;
  badge: number;
  sound: boolean;
  now?: Date;
}

const FALLBACK_SENDER = "Ai đó";
const FALLBACK_SCOPE = "Cuộc trò chuyện";
const HIDDEN_TITLE = "Super App";

/** `FULL` bị hạ xuống `SENDER` ở luồng hạn chế (NT-10) — hàm riêng để test và để `push.send` log đúng mức đã áp. */
export function effectiveLevel(level: LockScreenLevel, restricted: boolean): LockScreenLevel {
  return level === "FULL" && restricted ? "SENDER" : level;
}

function actionText(reason: FanoutReason): string {
  if (reason === "MENTION") return "đã nhắc tên bạn";
  if (reason === "MESSAGE") return "đã gửi tin nhắn";
  return "đã trả lời trong luồng";
}

function hiddenBody(reason: FanoutReason, batchCount?: number): string {
  if (batchCount && batchCount > 1) return `${batchCount} tin nhắn mới`;
  return reason === "MENTION" ? "Bạn được nhắc tên" : "Bạn có tin nhắn mới";
}

function titleFor(input: BuildMessagePushInput): string {
  if (input.scopeType === "CHANNEL") return `#${input.scopeName ?? "kênh"}`;
  if (input.conversationKind === "DIRECT") return input.senderName ?? FALLBACK_SENDER;
  return input.scopeName ?? FALLBACK_SCOPE;
}

function senderBody(input: BuildMessagePushInput): string {
  if (input.batchCount && input.batchCount > 1) return `${input.batchCount} tin nhắn mới`;
  const sender = input.senderName ?? FALLBACK_SENDER;
  const action = actionText(input.reason);
  return input.scopeType === "CONVERSATION" && input.conversationKind === "DIRECT"
    ? `${action.charAt(0).toUpperCase()}${action.slice(1)}`
    : `${sender}: ${action}`;
}

function fullBody(input: BuildMessagePushInput): string {
  if (input.preview === "") return senderBody(input);
  const isDirect = input.scopeType === "CONVERSATION" && input.conversationKind === "DIRECT";
  return isDirect ? input.preview : `${input.senderName ?? FALLBACK_SENDER}: ${input.preview}`;
}

/**
 * Payload push tin nhắn (be.md §5.6 bước 3) — 3 mức `lockScreenPreview`: HIDDEN (mặc định, không lộ gì) ·
 * SENDER (tên người gửi/nhóm/kênh) · FULL (trích ≤ 100 ký tự, hạ xuống SENDER ở luồng hạn chế). Luôn kèm
 * `type, scopeType, scopeId, messageId, targetUserId` — app FETCH LẠI khi mở, không tin nội dung push.
 * Hàm thuần: tên/trích đoạn do nơi gọi nạp và đã kiểm quyền.
 */
export function buildMessagePushPayload(input: BuildMessagePushInput): PushPayload {
  const level = effectiveLevel(input.level, input.restricted);
  const type = PUSH_TYPE_BY_REASON[input.reason];
  const isBatch = !!input.batchCount && input.batchCount > 1;

  let title = HIDDEN_TITLE;
  let body = hiddenBody(input.reason, input.batchCount);
  if (level === "SENDER") {
    title = titleFor(input);
    body = senderBody(input);
  } else if (level === "FULL") {
    title = titleFor(input);
    body = fullBody(input);
  }

  const data: Record<string, string> = { messageId: input.messageId, v: "1" };
  if (input.threadId) data["threadId"] = input.threadId;
  // `Message.threadId` LÀ id TIN GỐC của thread (= `Thread.parentMessageId`, KHÔNG phải `Thread.id`) — đặt thêm tên tường minh
  // `rootMessageId` để app dựng route `/thread/[messageId]` mà không phải đoán ý nghĩa của `threadId`.
  if (input.threadId) data["rootMessageId"] = input.threadId;
  if (input.conversationKind) data["conversationKind"] = input.conversationKind;
  if (isBatch) data["count"] = String(input.batchCount);

  const collapseKey =
    type === "mention"
      ? `mention:${input.messageId}`
      : type === "thread.reply" && input.threadId
        ? `thread:${input.threadId}`
        : `msg:${input.scopeId}`;

  return {
    type,
    targetUserId: input.userId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    ...(input.workspaceId && { workspaceId: input.workspaceId }),
    sentAt: (input.now ?? new Date()).toISOString(),
    title,
    body,
    data,
    ttlSeconds: 3600,
    collapseKey,
    androidChannel: input.reason === "MESSAGE" ? "default" : "mentions",
    badge: input.badge,
    groupKey: input.scopeKey,
    sound: input.sound,
  };
}
