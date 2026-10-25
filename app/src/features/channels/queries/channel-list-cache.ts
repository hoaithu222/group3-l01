import type { QueryClient } from '@tanstack/react-query';

import type { ChannelDetail, ChannelListResponse } from '../api';
import { mapChannelList } from '../hooks/channel-socket.utils';
import { channelKeys } from './channels.keys';

/**
 * Vá hàng của kênh trong danh sách theo bản chi tiết server vừa trả.
 *
 * ⚠️ Danh sách kênh nằm DƯỚI màn Thông tin (vẫn mounted): chỉ vá `detail` thì quay lại vẫn thấy tên cũ/kênh "đã lưu trữ" dù
 * vừa khôi phục — sự kiện socket dội về không đảm bảo có ở máy vừa thao tác (khôi phục còn không có sự kiện riêng).
 */
export function syncListItem(queryClient: QueryClient, wsId: string, detail: ChannelDetail): void {
  queryClient.setQueryData<ChannelListResponse>(channelKeys.list(wsId), (prev) =>
    prev
      ? mapChannelList(prev, detail.id, (item) => ({
          ...item,
          isDefault: detail.isDefault,
          name: detail.name,
          postingPolicy: detail.postingPolicy,
          status: detail.status,
        }))
      : prev,
  );
}

/** Lưu trữ/khôi phục đổi kênh MẶC ĐỊNH (kênh thay thế) ⇒ lấy lại danh sách + `defaultChannelId` của nhóm (khoá của `workspaces`). */
export function refreshAfterStatusChange(queryClient: QueryClient, wsId: string): void {
  void queryClient.invalidateQueries({ queryKey: channelKeys.list(wsId) });
  void queryClient.invalidateQueries({ queryKey: ['workspaces', 'detail', wsId] });
}

/** Chèn kênh vừa khôi phục vào đầu "Kênh của bạn" — gỡ bản ARCHIVED cũ trước (`channel:archived` chỉ đổi trạng thái), không thì trùng `id`. */
export function insertRestoredChannel(
  queryClient: QueryClient,
  wsId: string,
  restored: ChannelDetail,
): void {
  queryClient.setQueryData<ChannelListResponse>(channelKeys.list(wsId), (prev) =>
    prev
      ? {
          discoverable: prev.discoverable.filter((item) => item.id !== restored.id),
          joined: [restored, ...prev.joined.filter((item) => item.id !== restored.id)],
        }
      : prev,
  );
}
