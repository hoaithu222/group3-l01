import type { QueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat';

import { conversationKeys } from '../api/conversations.keys';
import type {
  ConversationDetail,
  ConversationFilter,
  ConversationListItem,
} from '../api/conversations.types';
import { lastMessageFromActivity } from './apply-conversation-event';
import type { ConversationListData } from './conversation-list-pages';
import type { ConversationActivityEvent } from './conversation-socket-events.types';

/**
 * Cache PHỤ mà sự kiện `conversation:*` phải chạm NGOÀI các danh sách `list` — tách khỏi `useConversationSocket` (trần 150 dòng).
 *
 * ⚠️ "Đã ghim" (`conversationKeys.pinned()`) là MẢNG thường (query song song, không phân trang), nên các hàm vá `InfiniteData`
 * không chạm tới nó: thiếu các hàm dưới đây thì mục ghim đứng im (tin mới, đổi tên, bỏ ghim ở máy khác…) tới khi tải lại app.
 */

/** Mọi danh sách `['conversations','list',{filter,…}]` đang cache — CHỈ dạng `InfiniteData` (dữ liệu khác hình làm hàm vá ném lỗi). */
export function listQueries(queryClient: QueryClient) {
  return queryClient
    .getQueriesData<ConversationListData>({ queryKey: [...conversationKeys.all, 'list'] })
    .filter(([, data]) => data === undefined || Array.isArray(data.pages))
    .map(([key, data]) => ({
      key,
      data,
      filter: (key[2] as { filter: ConversationFilter } | undefined)?.filter ?? 'all',
    }));
}

/**
 * Vá tại chỗ MỘT hàng của mục "Đã ghim" (thứ tự ghim không đổi theo hoạt động).
 * ⚠️ Không có hàng đó thì KHÔNG gọi `setQueryData`: gọi là đặt lại `dataUpdatedAt` ⇒ query bị coi là "vừa tải", lỡ lượt làm mới.
 */
export function patchPinned(
  queryClient: QueryClient,
  id: string,
  patch: (item: ConversationListItem) => ConversationListItem,
): void {
  const items = queryClient.getQueryData<ConversationListItem[]>(conversationKeys.pinned());
  if (!items?.some((item) => item.id === id)) return;
  queryClient.setQueryData(
    conversationKeys.pinned(),
    items.map((item) => (item.id === id ? patch(item) : item)),
  );
}

/**
 * `conversation:activity` ngoài danh sách: `ReadReceiptFooter` suy "tin cuối của mình" từ `detail.lastMessage` (`ChatRoom` không
 * xuất state ra ngoài props) — giữ trường này tươi cùng lúc với danh sách. Tin có tệp/ảnh ⇒ thư viện "Ảnh, Video" đã cũ.
 */
export function applyActivityToSideCaches(
  queryClient: QueryClient,
  payload: ConversationActivityEvent,
): void {
  const detailKey = conversationKeys.detail(payload.conversationId);
  const detail = queryClient.getQueryData<ConversationDetail>(detailKey);
  if (detail) {
    queryClient.setQueryData<ConversationDetail>(detailKey, {
      ...detail,
      activityAt: payload.createdAt,
      lastMessage: lastMessageFromActivity(detail.lastMessage, payload),
    });
  }
  if (payload.attachmentKind) {
    void queryClient.invalidateQueries({
      queryKey: [...conversationKeys.all, 'media', payload.conversationId],
    });
  }
}

/** `conversation:member-updated` (nhóm): danh sách thành viên + gợi ý @nhắc tên; vai trò CỦA MÌNH đổi ⇒ `myRole`/`myPermissions` tính lại. */
export function applyGroupMemberUpdate(
  queryClient: QueryClient,
  conversationId: string,
  isMe: boolean,
): void {
  // Tiền tố (không phải `members(id)` — khoá đó mang `q: ''`, không khớp các lượt tìm trong danh sách thành viên).
  void queryClient.invalidateQueries({
    queryKey: [...conversationKeys.all, 'members', conversationId],
  });
  void queryClient.invalidateQueries({
    queryKey: [...chatKeys.all, 'mentionables', 'CONVERSATION', conversationId],
  });
  if (isMe)
    void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
}

/** Hội thoại không còn (rời/bị xoá/giải tán) — gỡ khỏi "Đã ghim", danh sách tin và dòng "Đã lưu trữ". */
export function forgetConversationSideCaches(queryClient: QueryClient, id: string): void {
  const items = queryClient.getQueryData<ConversationListItem[]>(conversationKeys.pinned());
  if (items?.some((item) => item.id === id)) {
    queryClient.setQueryData(
      conversationKeys.pinned(),
      items.filter((item) => item.id !== id),
    );
  }
  queryClient.removeQueries({
    queryKey: chatKeys.scope({ scopeType: 'CONVERSATION', scopeId: id }),
  });
  void queryClient.invalidateQueries({ queryKey: conversationKeys.archivedPeek() });
}
