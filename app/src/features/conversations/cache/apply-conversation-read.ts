import type { QueryClient } from '@tanstack/react-query';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, ConversationFilter, ConversationListItem } from '../api/conversations.types';
import { belongsInFilter } from './apply-conversation-event';
import { findConversation, patchConversation, removeConversation, type ConversationListData } from './conversation-list-pages';

/**
 * Kết quả của một lần đọc — từ `POST /read-markers` ({ lastReadSeq }) hoặc `read:updated` (thêm `unreadCount`/`mentionCount`
 * chuẩn của server, p1-07 `be.md` §15.5).
 */
export interface ConversationReadEvent {
  lastReadSeq: number;
  mentionCount?: number;
  unreadCount?: number;
}

/**
 * Vá MỘT hàng theo mốc đọc. Có `unreadCount` từ server → tin nó (số phi chuẩn hoá `ConversationMember.unreadCount`).
 * Không có (kết quả POST cục bộ) → chỉ về 0 khi mốc đã tới tin cuối đã biết; còn tin mới hơn thì giữ số cũ, lần
 * làm mới/`read:updated` sau sẽ chuẩn. `markedUnread` luôn về `false` — đọc là bỏ "đánh dấu chưa đọc" (README §2).
 */
export function applyConversationRead<T extends ConversationListItem>(item: T, event: ConversationReadEvent): T {
  // Có `lastMessage` nhưng `seq` không phải số (payload cũ/hỏng lây từ `conversation:activity` thiếu field) →
  // chưa rõ tin cuối là gì, ĐỪNG mặc định coi `seq=0` (sẽ suy nhầm "đã đọc hết") — coi như chưa bắt kịp, giữ
  // nguyên `unreadCount`/`hasMention` cũ, đợi lần làm mới/sự kiện sau có `seq` chuẩn mới suy lại.
  const seqKnown = item.lastMessage === null || typeof item.lastMessage.seq === 'number';
  const lastSeq = item.lastMessage?.seq ?? 0;
  const caughtUp = seqKnown && event.lastReadSeq >= lastSeq;
  const unreadCount = event.unreadCount ?? (caughtUp ? 0 : item.unreadCount);
  const hasMention = event.mentionCount !== undefined ? event.mentionCount > 0 : caughtUp ? false : item.hasMention;
  if (unreadCount === item.unreadCount && hasMention === item.hasMention && !item.markedUnread) return item;
  return { ...item, hasMention, markedUnread: false, unreadCount };
}

/** Hàng có còn thuộc bộ lọc "Chưa đọc" sau khi đọc? Chỉ bộ lọc này phụ thuộc trạng thái đọc. */
function stillBelongs(filter: ConversationFilter, item: ConversationListItem): boolean {
  return filter !== 'unread' || belongsInFilter(filter, item);
}

/** Vá danh sách theo `filter` (lấy từ chính khoá cache): đọc xong thì hàng rời tab "Chưa đọc". */
export function applyConversationReadInList(
  data: ConversationListData | undefined,
  filter: ConversationFilter,
  conversationId: string,
  event: ConversationReadEvent,
): ConversationListData | undefined {
  if (!data) return data;
  const found = findConversation(data, conversationId);
  if (!found) return data;
  const patched = applyConversationRead(found, event);
  if (patched === found) return data;
  return stillBelongs(filter, patched)
    ? patchConversation(data, conversationId, () => patched)
    : removeConversation(data, conversationId);
}

/**
 * "Đánh dấu tất cả đã đọc" (`POST /me/read-all-conversations { before }`): mọi hàng có `activityAt ≤ before` về đã đọc — hàng
 * tới SAU `before` giữ nguyên (NT-13). Hàng rời tab "Chưa đọc". Vá lạc quan; server đối chiếu ở lần làm mới sau.
 */
export function applyReadAllInList(
  data: ConversationListData | undefined,
  filter: ConversationFilter,
  before: string,
): ConversationListData | undefined {
  if (!data) return data;
  const limit = new Date(before).getTime();
  let changed = false;
  const pages = data.pages.map((page) => ({
    ...page,
    data: page.data.flatMap((item) => {
      const isUnread = item.unreadCount > 0 || item.hasMention || item.markedUnread;
      if (!isUnread || new Date(item.activityAt).getTime() > limit) return [item];
      changed = true;
      const patched = { ...item, hasMention: false, markedUnread: false, unreadCount: 0 };
      return stillBelongs(filter, patched) ? [patched] : [];
    }),
  }));
  return changed ? { ...data, pages } : data;
}

/**
 * Vá MỌI nơi giữ hội thoại này trong cache: mọi danh sách (mọi bộ lọc), danh sách ghim và chi tiết.
 * Dùng cho cả đường cục bộ (`onMarkedRead` của `ChatRoom`) lẫn socket (`read:updated` từ máy khác).
 */
export function patchConversationRead(
  queryClient: QueryClient,
  conversationId: string,
  event: ConversationReadEvent,
): void {
  for (const [key, data] of queryClient.getQueriesData<ConversationListData>({
    queryKey: [...conversationKeys.all, 'list'],
  })) {
    const filter = (key[2] as { filter: ConversationFilter } | undefined)?.filter ?? 'all';
    const next = applyConversationReadInList(data, filter, conversationId, event);
    if (next !== data) queryClient.setQueryData(key, next);
  }

  queryClient.setQueryData<ConversationListItem[]>(conversationKeys.pinned(), (items) =>
    items?.map((item) => (item.id === conversationId ? applyConversationRead(item, event) : item)),
  );

  queryClient.setQueryData<ConversationDetail>(conversationKeys.detail(conversationId), (detail) =>
    detail
      ? { ...applyConversationRead(detail, event), lastReadSeq: Math.max(detail.lastReadSeq, event.lastReadSeq) }
      : detail,
  );
}
