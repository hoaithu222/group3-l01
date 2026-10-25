import type { MessagePollView, MessageSourceRefView } from '@/shared/message-extensions';

import type {
  ChatScopeType,
  LinkPreview,
  MessageAttachment,
  MessageKind,
  MessageMention,
  MessagePermissions,
  MessageLink,
  SystemMessageType,
} from '../api/chat.types';

/**
 * Payload socket — be.md §6. Khác `MessageView` (REST): KHÔNG có `myPermissions`
 * lẫn `reactions[].me` (server không tính hai thứ đó cho fan-out, chúng phụ
 * thuộc TỪNG người xem). `apply-socket-event.ts` tự tổng hợp lại từ dữ liệu
 * cache sẵn có — xem `synthesizeMyPermissions`.
 */
export interface MessageCreatedEvent {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  seq: number;
  kind: MessageKind;
  systemType: SystemMessageType | null;
  systemPayload: Record<string, unknown> | null;
  authorId: string | null;
  clientMessageId: string | null;
  content: string | null;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
  links: MessageLink[];
  linkPreview: LinkPreview | null;
  replyToId: string | null;
  replyPreview: MessageCreatedReplyPreview | null;
  forwardedFrom: MessageCreatedForwardedFrom | null;
  reactions: { emoji: string; count: number }[];
  pinnedAt: string | null;
  pinnedBy: string | null;
  editedAt: string | null;
  version: number;
  createdAt: string;
  /** p7-04 — tin khảo sát mang thêm `poll` (bản dùng chung, không `myOptionIds`). */
  poll?: MessagePollView;
  sourceRefs?: MessageSourceRefView[];
}
export interface MessageCreatedReplyPreview {
  authorId: string | null;
  excerpt: string;
  kind: string;
  deleted: boolean;
}
export interface MessageCreatedForwardedFrom {
  messageId: string;
  scopeType: ChatScopeType;
  authorId: string | null;
  createdAt: string;
}

export interface MessageUpdatedEvent {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId?: string | null;
  content: string | null;
  mentions: MessageMention[];
  links: MessageLink[];
  linkPreview?: LinkPreview | null;
  editedAt: string;
  version: number;
  reason: 'EDIT' | 'LINK_PREVIEW';
}

export interface MessageDeletedEvent {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId?: string | null;
  seq: number;
  deletedAt: string;
  mode: 'AUTHOR_RECALL' | 'MODERATION';
}

export interface MessageHiddenEvent {
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  hidden: boolean;
  originDeviceId?: string;
}

export interface ReactionUpdatedEvent {
  messageId: string;
  emoji: string;
  count: number;
  userId: string;
  action: 'ADD' | 'REMOVE';
}

export interface PinUpdatedEvent {
  messageId: string;
  scopeType: ChatScopeType;
  scopeId: string;
  pinned: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
}

/**
 * `thread:updated` (room `ch:{id}`, be.md p1-06 §6) — số liệu tóm tắt của MỘT luồng. KHÔNG có `channelId`:
 * tin gốc tìm theo `parentMessageId` (id duy nhất toàn hệ thống) trong cache của phòng đang mở.
 */
export interface ThreadUpdatedEvent {
  threadId: string;
  parentMessageId: string;
  replyCount: number;
  lastReplyAt: string | null;
  lastReplierIds: string[];
  lastReplySeq: number;
}

/** Dùng để tổng hợp lại `myPermissions` còn thiếu ở payload socket — xem `synthesizeMyPermissions`. */
export type PermissionBaseline = Omit<MessagePermissions, 'canEdit' | 'canRecall' | 'canReport'>;
