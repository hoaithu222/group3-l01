import type { ConversationFilter, MediaKind } from './conversations.types';

/** Khoá query của `conversations` (app.md §4.1). */
export const conversationKeys = {
  all: ['conversations'] as const,
  list: (f: { filter: ConversationFilter; q?: string; workspaceId?: string }) =>
    [...conversationKeys.all, 'list', f] as const,
  pinned: () => [...conversationKeys.all, 'pinned'] as const,
  /**
   * "Có hội thoại lưu trữ nào không" (`useHasArchivedConversations`, `limit: 1`, dữ liệu là MỘT trang `ConversationsPage`).
   *
   * ⛔ KHÔNG đặt dưới tiền tố `list`: mọi nơi vá cache theo `[...all, 'list']` (socket `conversation:*`, đọc, ghim/lưu trữ,
   * tạo nhóm) coi dữ liệu là `InfiniteData` (`data.pages`) — bản cũ `[...list({ filter: 'archived' }), 'peek']` làm chúng NÉM
   * `TypeError`, cả chuỗi đồng bộ dừng giữa chừng (danh sách, badge, ghim/lưu trữ không tới server).
   */
  archivedPeek: () => [...conversationKeys.all, 'archived-peek'] as const,
  detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
  direct: (userId: string) => [...conversationKeys.all, 'direct', userId] as const,
  members: (id: string, q?: string) => [...conversationKeys.all, 'members', id, q ?? ''] as const,
  media: (id: string, kind: MediaKind) => [...conversationKeys.all, 'media', id, kind] as const,
  receipts: (id: string, seq: number) => [...conversationKeys.all, 'receipts', id, seq] as const,
  people: (q: string) => [...conversationKeys.all, 'people', q] as const,
  workspaces: () => [...conversationKeys.all, 'workspaces'] as const,
};
