import type { WorkspaceUnread } from '@/core/notifications';
import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { ChannelListItem } from '../api';

/** be.md §5.2 đã sắp `joined` theo `pinned → isDefault → position → name` — sắp lại ở
 *  client SAU optimistic ghim/đổi thứ tự (`useChannelMe`) để UI phản hồi ngay, không
 *  chờ refetch. */
export function sortJoined(items: ChannelListItem[]): ChannelListItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name, 'vi');
  });
}

/**
 * Vị trí MỚI để chèn kênh ở `index` vào giữa hai hàng xóm sau khi
 * chuyển lên/xuống một bậc (app.md §7: "Điện thoại sắp xếp bằng 'Di chuyển
 * lên/xuống', không kéo thả P0"). `undefined` = đã ở đầu/cuối, không di chuyển
 * được nữa.
 */
export function computeMovePosition(
  joined: ChannelListItem[],
  index: number,
  direction: 'down' | 'up',
): number | undefined {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  const target = joined[targetIndex];
  if (!target) return undefined;

  const neighborIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;
  const neighbor = joined[neighborIndex];
  if (!neighbor) return direction === 'up' ? target.position - 1 : target.position + 1;
  return (neighbor.position + target.position) / 2;
}

/**
 * "Khám phá" khi đang tìm kiếm (app.md §3): lọc CLIENT trên danh sách đã tải,
 * hợp với kết quả `GET /channels/search` (kênh public chưa từng thấy trong
 * `discoverable` — vd danh sách quá dài đã cắt trang). Loại các kênh đã
 * `joined` khỏi kết quả gộp — server search không phân biệt joined/discover.
 */
export function mergeDiscoverable(
  discoverable: ChannelListItem[],
  serverResults: ChannelListItem[],
  query: string,
  joinedIds: ReadonlySet<string>,
): ChannelListItem[] {
  const byId = new Map(discoverable.filter((item) => matchesSearch(query, item.name)).map((item) => [item.id, item]));
  for (const item of serverResults) {
    if (!joinedIds.has(item.id) && !byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

/**
 * Gộp số chưa đọc THẬT (`GET /me/unread?workspaceId=` → `channels[id] = { unread, mentions, capped }`) vào các hàng của danh
 * sách kênh (p1-07 app.md §3 "Badge"). `GET /workspaces/:id/channels` không trả số này, còn nguồn kia đã được vá LIVE bởi
 * `useReadStateSync` (tin mới → +1) và `useReadMarker` (đọc → 0) nên hàng tự hạ chấm khi người dùng đã đọc.
 *
 * Kênh không có mục trong `unread` (chưa tải xong, mất mạng, hoặc chưa tham gia) GIỮ NGUYÊN — không bịa "0". Trả NGUYÊN mảng khi
 * chưa có dữ liệu để `useMemo` phía trên không vẽ lại thừa.
 */
export function withChannelUnread(
  items: ChannelListItem[],
  unread: WorkspaceUnread | undefined,
): ChannelListItem[] {
  if (!unread) return items;
  return items.map((item) => {
    const stat = unread.channels[item.id];
    if (!stat) return item;
    return { ...item, mentionCount: stat.mentions, unreadCapped: stat.capped, unreadCount: stat.unread };
  });
}
