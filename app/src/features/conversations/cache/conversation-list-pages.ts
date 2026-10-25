import type { InfiniteData } from '@tanstack/react-query';

import type { ConversationListItem, ConversationsPage } from '../api/conversations.types';

/** `InfiniteData<ConversationsPage>` — dữ liệu cache của `useConversationList` (`useInfiniteQuery`). */
export type ConversationListData = InfiniteData<ConversationsPage>;

/** Tìm một hội thoại trong BẤT KỲ trang nào — không giả định nó nằm ở trang 1. */
export function findConversation(data: ConversationListData, id: string): ConversationListItem | undefined {
  for (const page of data.pages) {
    const found = page.data.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Gỡ MỘT hội thoại khỏi MỌI trang (app.md §4.2 "xoá khỏi vị trí cũ trong mọi
 * trang để không trùng") — CV-22: một sự kiện `activity` không được để lại hai
 * bản ghi (bản cũ ở trang 2, bản mới ở đầu trang 1).
 */
export function removeConversation(data: ConversationListData, id: string): ConversationListData {
  return { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.filter((item) => item.id !== id) })) };
}

/** Đưa MỘT hội thoại lên đầu trang 1 — no-op nếu cache chưa có trang nào. */
export function insertAtTop(data: ConversationListData, item: ConversationListItem): ConversationListData {
  const first = data.pages[0];
  if (!first) return data;
  return { ...data, pages: [{ ...first, data: [item, ...first.data] }, ...data.pages.slice(1)] };
}

/** Vá tại chỗ (KHÔNG di chuyển vị trí) — dùng cho sự kiện chỉ đổi thuộc tính, không đổi thứ tự (`updated`, `member-updated`). */
export function patchConversation(
  data: ConversationListData,
  id: string,
  patch: (item: ConversationListItem) => ConversationListItem,
): ConversationListData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((item) => (item.id === id ? patch(item) : item)),
    })),
  };
}
