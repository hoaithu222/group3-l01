/**
 * Payload các sự kiện `conversation:*`/`read:receipt` (be.md p1-05 §6). BE
 * không xuất kiểu dùng chung cho FE — khai lại ở đây theo mô tả be.md, cùng
 * quy ước `chat/cache/chat-socket-events.types.ts`.
 */
import type { ConversationListItem, ConversationNotifyMode, ReadOnlyReason } from '../api/conversations.types';

/** `conversation:activity` — p1-04 be.md §6 (mở rộng theo scope CONVERSATION, p1-05 §6). */
export interface ConversationActivityEvent {
  v: number;
  conversationId: string;
  workspaceId: string | null;
  seq: number;
  /** `null` với tin hệ thống (vd tóm tắt cuộc gọi). */
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  mentionMe?: boolean;
  preview?: string;
  attachmentKind?: string | null;
  systemType?: string | null;
  systemPayload?: Record<string, unknown> | null;
}

/** `conversation:created` — `ConversationListItem` theo viewer. */
export interface ConversationCreatedEvent {
  v: number;
  conversation: ConversationListItem;
}

/**
 * `conversation:updated`.
 *
 * ⚠️ `status`/`memberCount`/`version` CHỈ có ở bản đầy đủ (đổi tên/vai trò/giải tán…). Bản riêng của chặn/bỏ chặn
 * (`ConversationHooks.onUserBlocked`, p1-08) và của thành viên bị loại khỏi nhóm làm việc chỉ phát
 * `{ id, readOnly, readOnlyReason }` — nên ba trường này là TUỲ CHỌN: bản áp dụng không được ghi `undefined` đè lên
 * trạng thái đang có (mất `status`/`version` ⇒ `expectedVersion` gửi lên là `undefined`).
 */
export interface ConversationUpdatedEvent {
  v?: number;
  id: string;
  title?: string | null;
  avatarUrl?: string | null;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DISSOLVED';
  settings?: unknown;
  memberCount?: number;
  readOnly?: boolean;
  readOnlyReason?: ReadOnlyReason | null;
  version?: number;
}

/** `conversation:member-updated` — biến thể NHÓM (đổi vai trò/thêm/xoá/chuyển chủ), phát tới `conv:{id}`. */
export interface ConversationMemberUpdatedGroupEvent {
  v: number;
  conversationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'LEFT' | 'REMOVED';
}

/** `conversation:member-updated` — biến thể CÁ NHÂN (cài đặt của chính mình), phát tới `user:{id}`. */
export interface ConversationMemberUpdatedSelfEvent {
  v: number;
  conversationId: string;
  pinnedAt?: string | null;
  archivedAt?: string | null;
  markedUnread?: boolean;
  notifyMode?: ConversationNotifyMode;
  mutedUntil?: string | null;
  hiddenBeforeSeq?: number;
  originDeviceId?: string;
}

/** `conversation:removed`. */
export interface ConversationRemovedEvent {
  v: number;
  conversationId: string;
  reason: 'REMOVED' | 'LEFT' | 'WORKSPACE_REMOVED';
}

/** `read:receipt`. */
export interface ReadReceiptEvent {
  v: number;
  conversationId: string;
  userId: string;
  lastReadSeq: number;
  readAt: string;
}
