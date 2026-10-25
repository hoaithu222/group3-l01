import type { ConversationFilter, ConversationListItem } from '../api/conversations.types';
import { findConversation, insertAtTop, removeConversation, type ConversationListData } from './conversation-list-pages';
import type { ConversationActivityEvent, ConversationMemberUpdatedSelfEvent } from './conversation-socket-events.types';

/** be.md §5.6 — điều kiện một hàng có thuộc filter đang xem hay không (áp dụng SAU khi đã vá dữ liệu). */
export function belongsInFilter(filter: ConversationFilter, item: ConversationListItem): boolean {
  switch (filter) {
    case 'all':
      return item.archivedAt === null;
    case 'unread':
      return item.archivedAt === null && (item.markedUnread || item.unreadCount > 0);
    case 'direct':
      return item.archivedAt === null && item.kind === 'DIRECT';
    case 'group':
      return item.archivedAt === null && item.kind === 'GROUP';
    case 'archived':
      return item.archivedAt !== null;
    case 'pinned':
      return item.pinnedAt !== null;
  }
}

export type ActivityOutcome =
  | { outcome: 'ignored' }
  | { outcome: 'invalidate' }
  | { outcome: 'updated'; data: ConversationListData };

/**
 * `conversation:activity` (app.md §4.2) — không có hàng trong cache → báo
 * `invalidate` (caller tự debounce 1s); có → vá `lastMessage`/`activityAt`,
 * `unreadCount +1` nếu KHÔNG phải tin của mình và hội thoại KHÔNG đang mở
 * foreground, `hasMention ||= mentionMe`, tự bỏ lưu trữ trừ khi đang muted
 * (`item.muted` đã là cờ tổng hợp từ server, be.md §4) — rồi gỡ khỏi vị trí
 * cũ (MỌI trang, CV-22) và chèn lại đầu trang 1 chỉ nếu còn thuộc `filter`.
 */
export function applyConversationActivity(
  data: ConversationListData | undefined,
  filter: ConversationFilter,
  payload: ConversationActivityEvent,
  ctx: ActivityContext,
): ActivityOutcome {
  if (!data) return { outcome: 'ignored' };
  const found = findConversation(data, payload.conversationId);
  if (!found) return { outcome: 'invalidate' };

  const patched = patchByActivity(found, payload, ctx);
  const withoutOld = removeConversation(data, payload.conversationId);
  const next = belongsInFilter(filter, patched) ? insertAtTop(withoutOld, patched) : withoutOld;
  return { outcome: 'updated', data: next };
}

export interface ActivityContext {
  currentUserId: string | undefined;
  isOpenForeground: boolean;
}

/** "Tin cuối" dựng từ payload `conversation:activity` — tin hệ thống (tóm tắt cuộc gọi…) giữ `systemType`/`systemPayload` để dựng câu theo người xem. */
export function lastMessageFromActivity(
  previous: ConversationListItem['lastMessage'],
  payload: ConversationActivityEvent,
): NonNullable<ConversationListItem['lastMessage']> {
  return {
    id: previous?.id ?? '',
    seq: payload.seq,
    authorId: payload.authorId,
    authorName: payload.authorName,
    kind: payload.systemType ? 'SYSTEM' : 'USER',
    systemType: payload.systemType ?? null,
    systemPayload: payload.systemPayload ?? null,
    preview: payload.preview ?? previous?.preview ?? '',
    attachmentKind: payload.attachmentKind ?? null,
    deleted: false,
    createdAt: payload.createdAt,
  };
}

/** Vá MỘT hàng theo `conversation:activity` — dùng chung cho danh sách (`InfiniteData`) và mục "Đã ghim" (mảng thường). */
export function patchByActivity(
  found: ConversationListItem,
  payload: ConversationActivityEvent,
  ctx: ActivityContext,
): ConversationListItem {
  const isMine = payload.authorId !== null && payload.authorId === ctx.currentUserId;
  return {
    ...found,
    lastMessage: lastMessageFromActivity(found.lastMessage, payload),
    activityAt: payload.createdAt,
    unreadCount: isMine || ctx.isOpenForeground ? found.unreadCount : found.unreadCount + 1,
    hasMention: found.hasMention || Boolean(payload.mentionMe),
    archivedAt: found.muted ? found.archivedAt : null,
  };
}
/** `conversation:created` — chèn đầu nếu thuộc `filter` (loại trùng trước, phòng sự kiện tới hai lần). */
export function applyConversationCreated(
  data: ConversationListData | undefined,
  filter: ConversationFilter,
  item: ConversationListItem,
): ConversationListData | undefined {
  if (!data) return data;
  const withoutOld = removeConversation(data, item.id);
  return belongsInFilter(filter, item) ? insertAtTop(withoutOld, item) : withoutOld;
}

// `conversation:updated` (list + detail) tách sang `apply-conversation-updated.ts` để file này giữ dưới trần 150 dòng;
// re-export để nơi gọi/test cũ vẫn nhập từ đây.
export { applyConversationUpdatedInDetail, applyConversationUpdatedInList } from './apply-conversation-updated';

/** `conversation:member-updated` (cá nhân) — vá cài đặt riêng; archived → gỡ khỏi filter không còn muốn thấy nó. */
export function applyMemberUpdatedSelfInList(
  data: ConversationListData | undefined,
  filter: ConversationFilter,
  payload: ConversationMemberUpdatedSelfEvent,
): ConversationListData | undefined {
  if (!data) return data;
  const found = findConversation(data, payload.conversationId);
  if (!found) return data;
  const patched: ConversationListItem = {
    ...found,
    ...(payload.pinnedAt !== undefined && { pinnedAt: payload.pinnedAt }),
    ...(payload.archivedAt !== undefined && { archivedAt: payload.archivedAt }),
    ...(payload.markedUnread !== undefined && { markedUnread: payload.markedUnread }),
    ...(payload.notifyMode !== undefined && { notifyMode: payload.notifyMode, muted: payload.notifyMode === 'MUTED' }),
  };
  const withoutOld = removeConversation(data, payload.conversationId);
  return belongsInFilter(filter, patched) ? insertAtTop(withoutOld, patched) : withoutOld;
}

/** `conversation:removed` — gỡ khỏi danh sách/ghim đang cache (dọn `detail`/media/chat scope là việc của hook, cần `queryClient.removeQueries`). */
export function applyConversationRemoved(data: ConversationListData | undefined, conversationId: string): ConversationListData | undefined {
  if (!data) return data;
  return removeConversation(data, conversationId);
}

/** `hiddenBeforeSeq` tăng → lịch sử chat cũ không còn xem được, cache tin nhắn phải xoá (app.md §4.2) — quyết định THUẦN, hook gọi `removeQueries` thật. */
export function shouldClearChatCache(previousHiddenBeforeSeq: number, nextHiddenBeforeSeq: number | undefined): boolean {
  return nextHiddenBeforeSeq !== undefined && nextHiddenBeforeSeq > previousHiddenBeforeSeq;
}
