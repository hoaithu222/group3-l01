import type { ChannelListItem, ChannelListResponse } from '../api';

/** Áp một hàm patch lên CẢ HAI mảng `joined`/`discoverable`, giữ nguyên nếu không khớp `id`. */
export function mapChannelList(
  list: ChannelListResponse,
  id: string,
  patch: (item: ChannelListItem) => ChannelListItem,
): ChannelListResponse {
  const apply = (items: ChannelListItem[]) => items.map((item) => (item.id === id ? patch(item) : item));
  return { joined: apply(list.joined), discoverable: apply(list.discoverable) };
}

function containsChannel(list: ChannelListResponse, id: string): boolean {
  return list.joined.some((item) => item.id === id) || list.discoverable.some((item) => item.id === id);
}

/**
 * `channel:created` — be.md §5.1: PRIVATE chỉ tới người có grant (⇒ `joined`),
 * PUBLIC broadcast cả workspace nhưng chỉ người tạo có `ChannelMembership`
 * (người tạo đã được `useCreateChannel` chèn optimistic từ trước, nên khớp
 * `id` sẵn có ở đây là ca "sự kiện của chính mình tới muộn" — bỏ qua, không
 * chèn trùng). Còn lại suy theo `visibility`, đúng app.md §4.
 */
export function applyChannelCreated(
  list: ChannelListResponse,
  channel: ChannelListItem,
): ChannelListResponse {
  if (containsChannel(list, channel.id)) return list;
  return channel.visibility === 'PRIVATE'
    ? { ...list, joined: [...list.joined, channel] }
    : { ...list, discoverable: [...list.discoverable, channel] };
}

export interface ChannelArchivedPayload {
  id: string;
  status: 'ARCHIVED';
  archiveReason: string | null;
  replacementDefaultChannelId?: string;
}

/** `channel:archived` — kênh cũ mất cờ mặc định, kênh thay thế (nếu có) nhận cờ đó. */
export function applyChannelArchived(
  list: ChannelListResponse,
  payload: ChannelArchivedPayload,
): ChannelListResponse {
  const patchOne = (item: ChannelListItem): ChannelListItem => {
    if (item.id === payload.id) return { ...item, status: 'ARCHIVED', isDefault: false };
    if (payload.replacementDefaultChannelId && item.id === payload.replacementDefaultChannelId) {
      return { ...item, isDefault: true };
    }
    return item;
  };
  return { joined: list.joined.map(patchOne), discoverable: list.discoverable.map(patchOne) };
}

/** Xoá một kênh khỏi CẢ HAI mảng — `channel:revoked` (mất quyền private). */
export function removeChannelFromList(list: ChannelListResponse, id: string): ChannelListResponse {
  return {
    joined: list.joined.filter((item) => item.id !== id),
    discoverable: list.discoverable.filter((item) => item.id !== id),
  };
}
