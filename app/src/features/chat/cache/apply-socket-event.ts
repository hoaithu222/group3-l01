import type { ChatScopeRef, MessageView } from '../api/chat.types';
import {
  appendToLatestPage,
  isCaughtUpToLatest,
  markRepliesDeleted,
  maxLoadedSeq,
  patchMessageById,
  removeMessageById,
  type MessagesData,
} from './message-pages';
import { findPermissionBaseline, synthesizeMyPermissions } from './synthesize-permissions';
import type {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageHiddenEvent,
  MessageUpdatedEvent,
  PinUpdatedEvent,
  ReactionUpdatedEvent,
} from './chat-socket-events.types';

/** `scope`/`threadId` của payload có khớp phòng đang mở không — mọi handler bỏ qua nếu lệch. */
function matchesScope(scope: ChatScopeRef, payload: { scopeType: string; scopeId: string; threadId?: string | null }): boolean {
  return (
    payload.scopeType === scope.scopeType &&
    payload.scopeId === scope.scopeId &&
    (payload.threadId ?? undefined) === scope.threadId
  );
}

export type MessageCreatedOutcome =
  | { outcome: 'ignored' }
  | { outcome: 'gap'; fromSeq: number }
  | { outcome: 'buffered' }
  | { outcome: 'inserted'; data: MessagesData; clientMessageId: string | null };

/** `message:created` — be.md §6/app.md §4.4. */
export function applyMessageCreated(
  data: MessagesData | undefined,
  scope: ChatScopeRef,
  currentUserId: string | undefined,
  payload: MessageCreatedEvent,
): MessageCreatedOutcome {
  if (!data || !matchesScope(scope, payload)) return { outcome: 'ignored' };
  if (!isCaughtUpToLatest(data)) return { outcome: 'buffered' };

  const max = maxLoadedSeq(data);
  if (payload.seq > max + 1) return { outcome: 'gap', fromSeq: max };

  const message: MessageView = {
    ...payload,
    reactions: payload.reactions.map((r) => ({ ...r, me: false })),
    myPermissions: synthesizeMyPermissions(findPermissionBaseline(data), payload.authorId, currentUserId),
    deleted: false,
    deletedAt: null,
  };
  return { outcome: 'inserted', data: appendToLatestPage(data, message), clientMessageId: payload.clientMessageId };
}

/** `message:updated` — bỏ qua bản CŨ hơn version đang có trong cache. */
export function applyMessageUpdated(
  data: MessagesData | undefined,
  scope: ChatScopeRef,
  payload: MessageUpdatedEvent,
): MessagesData | undefined {
  if (!data || !matchesScope(scope, payload)) return data;
  return patchMessageById(data, payload.id, (m) =>
    payload.version > m.version
      ? {
          ...m,
          content: payload.content,
          mentions: payload.mentions,
          links: payload.links,
          linkPreview: payload.linkPreview ?? m.linkPreview,
          editedAt: payload.editedAt,
          version: payload.version,
        }
      : m,
  );
}

/** `message:deleted` — chuyển tombstone TẠI CHỖ (giữ `seq`) + cập nhật `replyPreview` của tin trỏ tới. */
export function applyMessageDeleted(
  data: MessagesData | undefined,
  scope: ChatScopeRef,
  payload: MessageDeletedEvent,
): MessagesData | undefined {
  if (!data || !matchesScope(scope, payload)) return data;
  const tombstoned = patchMessageById(data, payload.id, (m) => ({
    ...m,
    deleted: true,
    deletedAt: payload.deletedAt,
    content: null,
    attachments: [],
    mentions: [],
    links: [],
    linkPreview: null,
    reactions: [],
    pinnedAt: null,
  }));
  return markRepliesDeleted(tombstoned, payload.id);
}

export type MessageHiddenOutcome = { outcome: 'removed'; data: MessagesData } | { outcome: 'invalidate' } | { outcome: 'ignored' };

/** `message:hidden` (room `user:{id}`) — `hidden=true` loại khỏi trang tại chỗ; `false` không đủ dữ liệu để chèn lại, báo caller tự `invalidateQueries`. */
export function applyMessageHidden(
  data: MessagesData | undefined,
  scope: ChatScopeRef,
  payload: MessageHiddenEvent,
): MessageHiddenOutcome {
  if (payload.scopeType !== scope.scopeType || payload.scopeId !== scope.scopeId) return { outcome: 'ignored' };
  if (!payload.hidden) return { outcome: 'invalidate' };
  if (!data) return { outcome: 'ignored' };
  return { outcome: 'removed', data: removeMessageById(data, payload.messageId) };
}

/** `reaction:updated` — `me` chỉ đổi khi chính người dùng hiện tại là nguồn sự kiện (đa thiết bị). */
export function applyReactionUpdated(
  data: MessagesData | undefined,
  currentUserId: string | undefined,
  payload: ReactionUpdatedEvent,
): MessagesData | undefined {
  if (!data) return data;
  return patchMessageById(data, payload.messageId, (m) => {
    const isMine = payload.userId === currentUserId;
    const others = m.reactions.filter((r) => r.emoji !== payload.emoji);
    if (payload.count <= 0) {
      return { ...m, reactions: others };
    }
    const previous = m.reactions.find((r) => r.emoji === payload.emoji);
    const me = isMine ? payload.action === 'ADD' : (previous?.me ?? false);
    return { ...m, reactions: [...others, { emoji: payload.emoji, count: payload.count, me }] };
  });
}

/** `pin:updated` — caller còn phải `invalidateQueries(chatKeys.pins(scope))` (danh sách ghim tách khỏi cache tin nhắn). */
export function applyPinUpdated(
  data: MessagesData | undefined,
  scope: ChatScopeRef,
  payload: PinUpdatedEvent,
): MessagesData | undefined {
  if (!data || payload.scopeType !== scope.scopeType || payload.scopeId !== scope.scopeId) return data;
  return patchMessageById(data, payload.messageId, (m) => ({
    ...m,
    pinnedAt: payload.pinned ? (payload.pinnedAt ?? new Date().toISOString()) : null,
    pinnedBy: payload.pinned ? (payload.pinnedBy ?? null) : null,
  }));
}
