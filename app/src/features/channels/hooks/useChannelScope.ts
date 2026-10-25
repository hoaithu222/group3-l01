import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import type { ChannelDetail } from '../api';
import { channelKeys } from '../queries/channels.keys';
import { useChannel } from '../queries/channels.queries';

const REVOKED_TOAST_MESSAGE = 'Bạn không còn quyền xem kênh này';

export interface UseChannelScopeResult {
  channel: ChannelDetail | undefined;
  error: unknown;
  isLoading: boolean;
  /** Tải lại chi tiết kênh — nút "Thử lại" của màn khi tải lỗi. */
  refetch: () => void;
  /** `denied` = ack `room:join` lỗi (app.md §4: "ack lỗi → xử lý như mất quyền"). */
  status: 'denied' | 'joined' | 'pending';
}

/**
 * Phạm vi MỘT kênh đang mở (app.md p1-03 §2, §4) — mount ở `[chId]/_layout.tsx`.
 *
 *  · Focus → `room:join` (`ch:{id}`) qua `useRoomSubscription`, refcount dùng
 *    chung registry của `core/socket` — unmount/blur tự `room:leave`.
 *  · Ack lỗi (`denied`) HOẶC `channel:revoked` tới ĐÚNG kênh này khi đang mở →
 *    dọn cache của kênh + điều hướng về danh sách kênh + toast trung tính.
 *    ⚠️ Khác `useChannelSocket` (mount cao hơn, ở `[wsId]/_layout.tsx`): hook
 *    ĐÓ xử lý `channel:revoked` cho MỌI kênh (kể cả kênh không đang mở), hook
 *    NÀY xử lý riêng phần điều hướng — chỉ nó biết chắc "kênh này đang mở".
 *  · Gap-fill tin nhắn sau reconnect (p1-04) — CHƯA áp dụng, chưa có tin nhắn.
 */
export function useChannelScope(wsId: string, chId: string): UseChannelScopeResult {
  const queryClient = useQueryClient();
  const room = useRoomSubscription('ch', chId);
  const channelQuery = useChannel(chId);

  const leaveToChannelList = useCallback(() => {
    queryClient.removeQueries({ queryKey: channelKeys.detail(chId) });
    queryClient.removeQueries({ queryKey: ['channels', chId, 'members'] });
    queryClient.removeQueries({ queryKey: channelKeys.grants(chId) });
    router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]/channels' });
    showToast('info', REVOKED_TOAST_MESSAGE);
  }, [chId, queryClient, wsId]);

  useEffect(() => {
    if (room.status === 'denied') leaveToChannelList();
  }, [leaveToChannelList, room.status]);

  useSocketEvent<{ channelId: string }>(SocketEvent.CHANNEL_REVOKED, (payload) => {
    if (payload.channelId === chId) leaveToChannelList();
  });

  return {
    channel: channelQuery.data,
    error: channelQuery.error,
    isLoading: channelQuery.isLoading,
    refetch: () => void channelQuery.refetch(),
    status: room.status,
  };
}
