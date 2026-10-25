import { useMutation, useQueryClient } from '@tanstack/react-query';

import { notificationKeys } from '@/core/notifications';

import {
  channelsService,
  type ChannelDetail,
  type ChannelListResponse,
  type ChannelMePayload,
  type NotifyMode,
} from '../api';
import { channelKeys } from './channels.keys';

/** `ChannelListItem` VÀ `ChannelDetail` đều có ba trường này — dùng chung một hàm patch cho cả hai cache. */
interface ChannelMeFields {
  notifyMode: NotifyMode;
  pinned: boolean;
  position: number;
}

function applyChannelMePatch<T extends ChannelMeFields>(item: T, payload: ChannelMePayload): T {
  return {
    ...item,
    ...(payload.pinned !== undefined && { pinned: payload.pinned }),
    ...(payload.notifyMode !== undefined && { notifyMode: payload.notifyMode }),
    ...(payload.position !== undefined && { position: payload.position }),
  };
}

/**
 * Tham gia kênh PUBLIC — chuyển mục từ `discoverable` sang `joined` (app.md §4).
 *
 * ⚠️ `join` chỉ trả `ChannelListItem` (không có `myPermissions`/`myMembership`/`version`): gộp nó vào `detail` rồi thôi thì
 * `detail` giữ QUYỀN CỦA NGƯỜI NGOÀI mà lại được coi là "vừa tải" ⇒ màn chat mở ngay sau đó khoá ô nhập (`canWrite` cũ) suốt
 * `staleTime`. Gộp để màn hiện ngay tên/cờ mới, rồi ĐÁNH DẤU CŨ để lấy lại quyền thật; danh sách thành viên kênh cũng đổi.
 */
export function useJoinChannel(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chId: string) => channelsService.join(chId),
    onSuccess: (joined) => {
      queryClient.setQueryData<ChannelListResponse>(channelKeys.list(wsId), (prev) =>
        prev
          ? {
              joined: [...prev.joined.filter((item) => item.id !== joined.id), joined],
              discoverable: prev.discoverable.filter((item) => item.id !== joined.id),
            }
          : prev,
      );
      queryClient.setQueryData<ChannelDetail>(channelKeys.detail(joined.id), (prev) =>
        prev ? { ...prev, ...joined } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: channelKeys.detail(joined.id) });
      void queryClient.invalidateQueries({ queryKey: ['channels', joined.id, 'members'] });
    },
  });
}

/** Rời kênh — kênh PUBLIC quay lại `discoverable`, PRIVATE biến mất hẳn khỏi danh sách. */
export function useLeaveChannel(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chId: string) => channelsService.leave(chId),
    onSuccess: (_result, chId) => {
      queryClient.setQueryData<ChannelListResponse>(channelKeys.list(wsId), (prev) => {
        if (!prev) return prev;
        const left = prev.joined.find((item) => item.id === chId);
        return {
          joined: prev.joined.filter((item) => item.id !== chId),
          discoverable:
            left && left.visibility === 'PUBLIC' ? [...prev.discoverable, left] : prev.discoverable,
        };
      });
      queryClient.removeQueries({ queryKey: channelKeys.detail(chId) });
      // Danh sách thành viên/danh bạ tác giả của kênh không còn đúng (mình vừa rời) — vào lại thì tải mới.
      queryClient.removeQueries({ queryKey: ['channels', chId, 'members'] });
    },
  });
}

/**
 * Ghim/tắt tiếng/đổi thứ tự — optimistic NGAY (app.md §4: "optimistic chuyển
 * giữa joined/discoverable, ghim/thứ tự"). Patch cả hai mảng vì thứ hạng chỉ
 * áp dụng cho `joined`, nhưng `notifyMode` có thể đổi trên cả hai.
 */
export function useChannelMe(wsId: string, chId: string) {
  const queryClient = useQueryClient();
  const listKey = channelKeys.list(wsId);
  const detailKey = channelKeys.detail(chId);

  return useMutation({
    mutationFn: (payload: ChannelMePayload) => channelsService.updateMe(chId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = queryClient.getQueryData<ChannelListResponse>(listKey);
      const previousDetail = queryClient.getQueryData<ChannelDetail>(detailKey);

      queryClient.setQueryData<ChannelListResponse>(listKey, (prev) => {
        if (!prev) return prev;
        const applyIfMatch = <T extends ChannelMeFields & { id: string }>(item: T): T =>
          item.id === chId ? applyChannelMePatch(item, payload) : item;
        return { joined: prev.joined.map(applyIfMatch), discoverable: prev.discoverable.map(applyIfMatch) };
      });
      // Màn `ChannelInfoScreen` đọc `pinned`/`notifyMode` từ query DETAIL, không
      // phải từ danh sách — patch cả hai để hai màn không lệch nhau.
      queryClient.setQueryData<ChannelDetail>(detailKey, (prev) =>
        prev ? applyChannelMePatch(prev, payload) : prev,
      );

      return { previousDetail, previousList };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousList) queryClient.setQueryData(listKey, context.previousList);
      if (context?.previousDetail) queryClient.setQueryData(detailKey, context.previousDetail);
    },
    // BE có thể GHÌM giá trị khác lời gọi optimistic (vd `position` bị chuẩn
    // hoá lại) — đồng bộ giá trị THẬT vào cả hai cache khi request xong.
    // ⚠️ `ChannelMeResult.position` là `number | null` (be.md §4) trong khi
    // `ChannelListItem.position` không nhận `null` — giữ giá trị CŨ khi BE trả `null`.
    onSuccess: (result, payload) => {
      const reconcile = <T extends ChannelMeFields & { id: string }>(item: T): T =>
        item.id === chId
          ? { ...item, notifyMode: result.notifyMode, pinned: result.pinned, position: result.position ?? item.position }
          : item;
      queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
        prev ? { joined: prev.joined.map(reconcile), discoverable: prev.discoverable.map(reconcile) } : prev,
      );
      queryClient.setQueryData<ChannelDetail>(detailKey, (prev) => (prev ? reconcile(prev) : prev));
      // Tắt/bật tiếng kênh đổi cách đếm chưa đọc (huy hiệu nhóm + tab) — lấy số chuẩn của server.
      if (payload.notifyMode !== undefined) {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.workspaceUnread(wsId) });
        void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
      }
    },
  });
}
