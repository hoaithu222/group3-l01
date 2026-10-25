import type { MessagePollOptionView, MessagePollView } from '@/shared/message-extensions';

/**
 * Kiểu DTO của `chat-extensions` (p7-04) — đọc TRỰC TIẾP từ `be/src/modules/chat-extensions/entities/chat-extensions.types.ts` + `dtos/*.ts`. Ngày giờ là chuỗi ISO qua JSON.
 */
export type ChatScopeType = 'CHANNEL' | 'CONVERSATION';
export interface ChatScopeInput {
  scopeType: ChatScopeType;
  scopeId: string;
  /** Chỉ kênh: id TIN GỐC của luồng (BE `threadId`). */
  threadId?: string;
}

// ── Khảo sát ─────────────────────────────────────────────────────────────────
export type PollView = MessagePollView;
export type PollOptionView = MessagePollOptionView;

export interface CreatePollInput {
  clientMessageId: string;
  question: string;
  options: string[];
  multi: boolean;
  anonymous: boolean;
  /** ISO UTC; vắng = không hạn. */
  closesAt?: string;
}

/** Payload `poll:updated` — chỉ số đếm, KHÔNG `userId`/`myOptionIds` (BE `PollUpdatedPayload`). */
export interface PollUpdatedEvent {
  pollId: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  status: 'OPEN' | 'CLOSED';
  closeReason: PollView['closeReason'];
  options: { id: string; voteCount: number }[];
  voterCount: number;
  version: number;
}

export interface PollVoter {
  id: string;
  name: string;
  avatar: string | null;
  votedAt: string;
}
export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
export interface VotersPage {
  data: PollVoter[];
  meta: CursorMeta;
}

// ── Tin hẹn giờ ──────────────────────────────────────────────────────────────
export type ScheduledStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
/** Tab của "Tin đã hẹn": BE lọc `PENDING`/`FAILED`/`SENT` (`CANCELLED` có ở API nhưng app không hiện). `SENDING` là trạng thái thoáng qua, không có tab riêng. */
export type ScheduledTab = 'PENDING' | 'FAILED' | 'SENT';
export type ScheduledFailReason =
  | 'NO_PERMISSION'
  | 'SCOPE_ARCHIVED'
  | 'BLOCKED'
  | 'ATTACHMENT_INVALID'
  | 'SUB_FEATURE_OFF'
  | 'AUTHOR_INACTIVE'
  | 'UNKNOWN';

export interface ScheduledMention {
  type: 'USER' | 'ROLE' | 'ALL';
  targetId?: string | null;
}

export interface ScheduledMessageView {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  /** Tên kênh / tên người-nhóm theo quyền HIỆN TẠI; `null` khi không còn thấy phạm vi. */
  scopeLabel: string | null;
  content: string | null;
  mentions: ScheduledMention[];
  attachments: { assetId: string; name: string; mime: string; size: number }[];
  replyToId: string | null;
  sendAt: string;
  timezone: string;
  status: ScheduledStatus;
  messageId: string | null;
  failReason: ScheduledFailReason | null;
  failCode: string | null;
  version: number;
  createdAt: string;
}

export interface CreateScheduledInput {
  content?: string;
  mentions: { type: 'USER' | 'ROLE' | 'ALL'; targetId?: string }[];
  attachmentAssetIds: string[];
  replyToId?: string;
  threadId?: string;
  /** ISO UTC. */
  sendAt: string;
  /** IANA của máy lúc hẹn — chỉ để hiển thị lại. */
  timezone: string;
}

export interface UpdateScheduledInput {
  content?: string;
  sendAt?: string;
  timezone?: string;
  expectedVersion: number;
}

export interface ScheduledPage {
  data: ScheduledMessageView[];
  meta: CursorMeta;
}

/** Payload `scheduled-message:updated` (`user:{id}`) — không nội dung. */
export interface ScheduledUpdatedEvent {
  id: string;
  status: ScheduledStatus;
  sendAt: string;
  messageId: string | null;
  failReason: ScheduledFailReason | null;
  version: number;
}

// ── Nhắc lại ─────────────────────────────────────────────────────────────────
export type ReminderTab = 'PENDING' | 'FIRED';
export interface ReminderView {
  id: string;
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  remindAt: string;
  timezone: string;
  status: 'PENDING' | 'FIRED' | 'CANCELLED';
  /** Tin đã gỡ / mất quyền lúc đến hạn — KHÔNG trích nội dung, không mở tin. */
  unavailable: boolean;
  /** Chỉ khi tin còn đọc được lúc xem danh sách. */
  preview?: string;
}
export interface RemindersPage {
  data: ReminderView[];
  meta: CursorMeta;
}

// ── Chuyển tin thành task ────────────────────────────────────────────────────
export interface ToTaskInput {
  boardId: string;
  columnId?: string;
  title: string;
  includeQuote: boolean;
}
export interface ToTaskResult {
  task: { id: string; boardId: string; title: string };
  sourceRef: { kind: 'TASK'; refId: string };
}
export interface WorkspaceOption {
  id: string;
  name: string;
}
export interface BoardOption {
  id: string;
  name: string;
  columns: { id: string; title: string }[];
}

// ── Lưu tệp của tin vào tài liệu ──────────────────────────────────────────────
/** Body của `POST /messages/:id/to-resource` (BE `toResourceSchema`, `.strict()`): `assetIds` PHẢI là tệp đính kèm của CHÍNH tin đó (1–`LIMITS.message.attachmentsMax`). */
export interface ToResourceInput {
  workspaceId: string;
  /** Vắng = gốc kho tài liệu. */
  folderId?: string;
  assetIds: string[];
  /** BE mặc định `false`; nguồn hẹp hơn nhóm đích (hội thoại, kênh riêng tư) mà thiếu `true` ⇒ 400 `VAL_001` `details.requiresConfirmation`. */
  confirmVisibilityExpansion: boolean;
}
/** 201 `{ resources, sourceRefs }` — mỗi tệp một `Resource` mới trỏ cùng `assetId`. */
export interface ToResourceResult {
  resources: { id: string; assetId: string; name: string }[];
  sourceRefs: { kind: 'RESOURCE'; refId: string }[];
}
