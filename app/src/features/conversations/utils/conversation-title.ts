import type { ConversationListItem } from '../api/conversations.types';

/** app.md §7 — DIRECT luôn hiện tên NGƯỜI KIA, GROUP hiện `title` (rỗng ⇒ "Nhóm chưa đặt tên"). */
export function conversationTitle(item: Pick<ConversationListItem, 'kind' | 'title' | 'peer'>): string {
  if (item.kind === 'DIRECT') return item.peer?.name ?? 'Người dùng';
  return item.title && item.title.trim().length > 0 ? item.title : 'Nhóm chưa đặt tên';
}

/** Ảnh đại diện dùng cho tiêu đề — DIRECT lấy ảnh người kia, GROUP lấy ảnh nhóm (null ⇒ `ConversationAvatar` tự ghép avatar thành viên). */
export function conversationAvatarUrl(item: Pick<ConversationListItem, 'kind' | 'avatarUrl' | 'peer'>): string | null {
  return item.kind === 'DIRECT' ? (item.peer?.avatarUrl ?? null) : item.avatarUrl;
}
