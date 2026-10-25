import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getDeviceId } from '@/core/device/device-id';
import {
  isViewingScope,
  notificationKeys,
  type ReadUpdatedEvent,
  type UnreadSummaryChangedEvent,
  type WorkspaceUnread,
} from '@/core/notifications';
import { socket, SocketEvent, useSocketEvent } from '@/core/socket';
import { useAppActive } from '@/shared/hooks/useAppActive';
import { applyChannelMessage, applyChannelRead } from '@/shared/notifications/unread.cache';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useInboxSocketSync } from './useInboxSocketSync';
import { useRefreshSoon } from './useRefreshSoon';

/**
 * `channel:activity` (kênh public → room `ws:{id}`, kênh private → `user:{id}`; be.md p1-03 §6): tin mới ở một kênh —
 * chỉ khai phần dùng ở đây.
 *
 * `seq`/`lastSeq` là CÙNG một con số: `seq` là tên theo p1-03, `lastSeq` là tên p1-04 mà bản BE trước đó gửi. Khai cả
 * hai và đọc `seq ?? lastSeq` để app mới không phụ thuộc vào việc BE đã lên bản nào.
 */
interface ChannelActivityEvent {
  authorId?: string | null;
  channelId: string;
  lastSeq?: number;
  seq?: number;
  threadId?: string | null;
  workspaceId: string;
}

/**
 * Đồng bộ số chưa đọc + hộp thư theo socket (p1-07 `app.md` §4.3). Mount MỘT lần ở `(app)/_layout`, không phụ thuộc
 * màn nào đang mở — nên huy hiệu tab đúng dù đang ở tab khác.
 *
 * Nguyên tắc: vá cục bộ những gì SUY ĐƯỢC từ payload (độ trễ cảm nhận ≈ 0), rồi LUÔN làm mới có debounce để lấy số
 * chuẩn của server — sai lệch nhỏ (vd kênh tắt tiếng không tính vào tab) tự về đúng sau ≤ 1 giây.
 *
 * Phần hội thoại của `read:updated` (patch hàng danh sách/chi tiết) do `useConversationReadSync` ở feature
 * `conversations` lo — hook này không biết khoá cache của feature đó. Hộp thư: `useInboxSocketSync`.
 */
export function useReadStateSync(): void {
  const queryClient = useQueryClient();
  const myUserId = useAuthStore((state) => state.user?.id);
  const appState = useAppActive();
  const deviceId = useRef<string | undefined>(undefined);
  const refreshSoon = useRefreshSoon();
  useInboxSocketSync(refreshSoon);

  useEffect(() => {
    void getDeviceId().then((id) => {
      deviceId.current = id;
    });
  }, []);

  // Nối lại socket (có thể đã lỡ sự kiện) và app active lại sau khi ở nền: đối chiếu lại với server.
  useEffect(() => {
    const onConnect = () => {
      refreshSoon('summary');
      refreshSoon('inbox');
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [refreshSoon]);

  useEffect(() => {
    if (appState !== 'active') return;
    refreshSoon('summary');
    refreshSoon('inbox');
  }, [appState, refreshSoon]);

  useSocketEvent<ReadUpdatedEvent>(SocketEvent.READ_UPDATED, (event) => {
    // Máy nguồn đã vá cục bộ lúc đặt mốc (`useReadMarker`) — bỏ qua bản dội lại của chính nó.
    if (event.originDeviceId && event.originDeviceId === deviceId.current) return;
    if (event.streamType === 'CHANNEL') {
      queryClient.setQueriesData<WorkspaceUnread>(
        { queryKey: notificationKeys.workspaceUnreadAll },
        (data) => applyChannelRead(data, event.streamId, event.lastReadSeq),
      );
    }
    refreshSoon('summary');
  });

  useSocketEvent<UnreadSummaryChangedEvent>(SocketEvent.UNREAD_SUMMARY_CHANGED, () => {
    refreshSoon('summary');
  });

  useSocketEvent<ChannelActivityEvent>(SocketEvent.CHANNEL_ACTIVITY, (event) => {
    // Chỉ tin ở luồng CHÍNH của kênh KHÔNG phải của mình và KHÔNG đang xem mới là "chưa đọc" ở kênh.
    // ⚠️ `authorId` phải có TRONG payload: thiếu nó thì `undefined !== myUserId` luôn đúng và tin MÌNH vừa gửi cũng +1
    // vào chấm chưa đọc của kênh — bỏ vá lạc quan khi không biết tác giả, số chuẩn vẫn tới qua `refreshSoon` bên dưới.
    const seq = event.seq ?? event.lastSeq;
    if (
      event.authorId !== undefined &&
      event.authorId !== myUserId &&
      !event.threadId &&
      seq !== undefined &&
      !isViewingScope('CHANNEL', event.channelId)
    ) {
      queryClient.setQueryData<WorkspaceUnread>(
        notificationKeys.workspaceUnread(event.workspaceId),
        (data) => applyChannelMessage(data, event.channelId, seq),
      );
    }
    refreshSoon('summary');
  });

  useSocketEvent(SocketEvent.CONVERSATION_ACTIVITY, () => refreshSoon('summary'));
}
