import type { MessagePollOptionView, MessagePollView } from "../../../shared/ports/message-poll-reader.port";

/**
 * Kiểu domain của `chat-extensions` (p7-04) — khai ĐỘC LẬP với enum/model Prisma (cùng giá trị) để service không import `@prisma/client`
 * (luật 3 tầng: service chỉ biết repository interface).
 */
export type ChatScopeType = "CHANNEL" | "CONVERSATION";

// ── Khảo sát ─────────────────────────────────────────────────────────────────
export type PollStatus = "OPEN" | "CLOSED";
export type PollCloseReason = "EXPIRED" | "BY_CREATOR" | "BY_MODERATOR" | "MESSAGE_RECALLED";

export interface PollOptionEntity {
  /** 8 ký tự ngẫu nhiên, ổn định — khoá lựa chọn trong `PollVote.optionIds`. */
  id: string;
  text: string;
  voteCount: number;
  /** P1: người tham gia thêm lựa chọn. */
  addedBy: string | null;
}

export interface PollEntity {
  id: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  workspaceId: string | null;
  createdBy: string;
  question: string;
  normalizedQuestion: string;
  options: PollOptionEntity[];
  multi: boolean;
  anonymous: boolean;
  allowAddOptions: boolean;
  closesAt: Date | null;
  status: PollStatus;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: PollCloseReason | null;
  voterCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PollCreateInput {
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  workspaceId: string | null;
  createdBy: string;
  question: string;
  normalizedQuestion: string;
  options: PollOptionEntity[];
  multi: boolean;
  anonymous: boolean;
  closesAt: Date | null;
}

export interface PollVoteEntity {
  id: string;
  pollId: string;
  userId: string;
  optionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Người bầu cho một lựa chọn (chỉ trả khi khảo sát KHÔNG ẩn danh). */
export interface PollVoterRef {
  /** Id bản ghi phiếu — cùng `votedAt` làm khoá cursor `(at, id)` (id người bầu KHÔNG dùng làm cursor để không lộ thứ tự theo tài khoản). */
  voteId: string;
  userId: string;
  votedAt: Date;
}

/** Khảo sát trả cho client — cùng hình với `MessagePollView` của cổng đọc (một hợp đồng cho `MessageView.poll` lẫn `GET /polls/:id`). */
export type PollView = MessagePollView & { serverNow: string };
export type PollOptionView = MessagePollOptionView;

/** Payload `poll:updated` — KHÔNG có `userId`/`myOptionIds`. */
export interface PollUpdatedPayload {
  pollId: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  status: PollStatus;
  closeReason: PollCloseReason | null;
  options: Array<{ id: string; voteCount: number }>;
  voterCount: number;
  version: number;
}

export interface VoterView {
  id: string;
  name: string;
  avatar: string | null;
  votedAt: Date;
}

// ── Tin hẹn giờ ──────────────────────────────────────────────────────────────
export type ScheduledMessageStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
export type ScheduledFailReason =
  | "NO_PERMISSION"
  | "SCOPE_ARCHIVED"
  | "BLOCKED"
  | "ATTACHMENT_INVALID"
  | "SUB_FEATURE_OFF"
  | "AUTHOR_INACTIVE"
  | "UNKNOWN";

export interface ScheduledMentionEntity {
  type: "USER" | "ROLE" | "ALL";
  targetId?: string;
}

export interface ScheduledMessageEntity {
  id: string;
  authorId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  workspaceId: string | null;
  content: string | null;
  mentions: ScheduledMentionEntity[];
  attachmentAssetIds: string[];
  replyToId: string | null;
  sendAt: Date;
  timezone: string;
  status: ScheduledMessageStatus;
  messageId: string | null;
  failReason: ScheduledFailReason | null;
  failCode: string | null;
  attempts: number;
  sentAt: Date | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledMessageCreateInput {
  authorId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  workspaceId: string | null;
  content: string | null;
  mentions: ScheduledMentionEntity[];
  attachmentAssetIds: string[];
  replyToId: string | null;
  sendAt: Date;
  timezone: string;
}

/** Trường được đổi bởi `PATCH` (chỉ khi còn `PENDING`); `version` tự tăng. */
export interface ScheduledMessagePatch {
  content?: string | null;
  mentions?: ScheduledMentionEntity[];
  attachmentAssetIds?: string[];
  replyToId?: string | null;
  threadId?: string | null;
  sendAt?: Date;
  timezone?: string;
}

export interface ScheduledMessageView {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  /** Tên kênh / tên người-nhóm theo QUYỀN HIỆN TẠI của người xem; `null` khi không còn thấy phạm vi. */
  scopeLabel: string | null;
  content: string | null;
  mentions: ScheduledMentionEntity[];
  attachments: Array<{ assetId: string; name: string; mime: string; size: number }>;
  replyToId: string | null;
  sendAt: Date;
  timezone: string;
  status: ScheduledMessageStatus;
  messageId: string | null;
  failReason: ScheduledFailReason | null;
  failCode: string | null;
  version: number;
  createdAt: Date;
}

/** Payload `scheduled-message:updated` (tới `user:{authorId}`) — không nội dung. */
export interface ScheduledMessageUpdatedPayload {
  id: string;
  status: ScheduledMessageStatus;
  sendAt: Date;
  messageId: string | null;
  failReason: ScheduledFailReason | null;
  version: number;
}

// ── Nhắc lại tin ─────────────────────────────────────────────────────────────
export type MessageReminderStatus = "PENDING" | "FIRED" | "CANCELLED";

export interface MessageReminderEntity {
  id: string;
  userId: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  workspaceId: string | null;
  remindAt: Date;
  timezone: string;
  status: MessageReminderStatus;
  firedAt: Date | null;
  unavailable: boolean;
  notificationId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderCreateInput {
  userId: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  workspaceId: string | null;
  remindAt: Date;
  timezone: string;
}

export interface ReminderView {
  id: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  remindAt: Date;
  timezone: string;
  status: MessageReminderStatus;
  unavailable: boolean;
  /** Trích ngắn của tin — CHỈ khi còn đọc được lúc xem danh sách. */
  preview?: string;
}

// ── Phân trang ───────────────────────────────────────────────────────────────
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Tham số cursor `(at, id)` đã giải mã. */
export interface DecodedCursor {
  at: Date;
  id: string;
}
