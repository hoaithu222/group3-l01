import type { UnreadSummary } from '@/core/notifications';

import type { WorkspaceListItem } from '../api';

/**
 * Vá số chưa đọc/nhắc tên của MỖI thẻ nhóm bằng bản SỐNG (`GET /me/unread/summary`, cùng nguồn với huy hiệu tab
 * "Nhóm" ở bottom nav) — cùng kỹ thuật `withChannelUnread` (`features/channels/screens/channel-list.utils.ts`).
 *
 * ⛔ `GET /workspaces` chỉ trả `unreadCount`/`mentionCount` tại THỜI ĐIỂM tải trang; không có socket nào báo riêng
 * cho danh sách nhóm khi có tin mới/đọc xong (`useWorkspaceSocket` chỉ nghe `workspace:*`/`member:updated`/
 * `permission:revoked`) — thiếu bước vá này thì thẻ nhóm đứng yên ở số lúc mở tab, không tự hạ khi đọc xong ở
 * màn khác, và không tự lên khi có tin mới trong lúc đang đứng ở tab "Nhóm".
 *
 * Trả NGUYÊN tham chiếu khi không đổi số nào để `useMemo` phía trên không vẽ lại thừa.
 */
export function withWorkspaceUnread(
  items: WorkspaceListItem[],
  summary: UnreadSummary | undefined,
): WorkspaceListItem[] {
  if (!summary) return items;
  const byId = new Map(summary.workspaces.map((ws) => [ws.workspaceId, ws]));
  let changed = false;
  const next = items.map((item) => {
    const live = byId.get(item.id);
    if (!live || (live.unreadChannels === item.unreadCount && live.mentions === item.mentionCount)) return item;
    changed = true;
    return { ...item, unreadCount: live.unreadChannels, mentionCount: live.mentions };
  });
  return changed ? next : items;
}
