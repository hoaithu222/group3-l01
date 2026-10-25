import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { notificationKeys, type ReadMarkerResult, type WorkspaceUnread } from '@/core/notifications';
import { ChatRoom, useChatScope, type MessageView } from '@/features/chat';
import { applyChannelRead } from '@/shared/notifications';
import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { useWorkspaceUnread } from '@/shell/notifications';

import { channelsService, type ChannelDetail } from '../api';
import { ChannelHeader } from '../components/ChannelHeader';
import { ChannelReadOnlyBar, type ReadOnlyReason } from '../components/ChannelReadOnlyBar';
import { PrivateBanner } from '../components/PrivateBanner';
import { useChannelAuthors } from '../hooks/useChannelAuthors';
import { useChannelScope } from '../hooks/useChannelScope';

/**
 * `myPermissions.canWrite=false` xảy ra vì MỘT trong ba lý do (be.md p1-03
 * §5.5), nhưng `ChannelDetail` không tự nêu lý do — suy ra từ dữ liệu đang có:
 * kênh archived thì chắc chắn là lý do đó; `ADMINS_ONLY` mà mình không quản
 * được thì là lý do kia; còn lại (kênh vẫn ACTIVE, policy vẫn MEMBERS) chỉ có
 * thể là NHÓM đã lưu trữ — resolver đã ràng `writable = ch.ACTIVE && ws.ACTIVE`.
 */
function resolveReadOnlyReason(channel: ChannelDetail): ReadOnlyReason {
  if (channel.status === 'ARCHIVED') return 'CHANNEL_ARCHIVED';
  if (channel.postingPolicy === 'ADMINS_ONLY' && !channel.myPermissions.canManage) return 'ADMINS_ONLY';
  return 'WORKSPACE_ARCHIVED';
}

/**
 * `chat` (p1-04) là feature NỀN — `ChatRoom` chỉ nhận `scope`/`capabilities`
 * chung, không biết gì về kênh. `ChannelHeader`/`PrivateBanner`/`ChannelReadOnlyBar`
 * (p1-03, đã đúng từ trước) vẫn do MÀN NÀY sở hữu và đặt quanh `ChatRoom` —
 * đúng lý do app.md p1-04 §1 tách `header`/`capabilities` ra khỏi bản thân
 * `ChatRoom`: màn cha giữ quyền hiển thị banner/tiêu đề riêng của nó.
 *
 * `readOnlyReason` KHÔNG truyền vào `capabilities` — thanh lý do cụ thể đã có
 * `ChannelReadOnlyBar` ngay dưới `ChatRoom`; `Composer` chỉ cần biết
 * `canWrite` để tự khoá, hiện thêm một câu lý do ở đó là lặp chữ với banner này.
 * `hideReadOnlyNotice` bảo `Composer` cũng KHÔNG vẽ thanh chung "Bạn không thể gửi tin ở đây." — không thì phòng chỉ-đọc có
 * hai thanh khoá xếp chồng.
 */
export function ChannelChatScreen() {
  // `m` — deep link `/w/{wsId}/c/{chId}?m={messageId}` (app.md p1-03 §1) → mở quanh tin đó.
  const { chId, wsId, m } = useLocalSearchParams<{ chId: string; wsId: string; m?: string }>();
  const { channel, error, isLoading, refetch, status } = useChannelScope(wsId, chId);
  const chatScope = useChatScope('CHANNEL', chId);
  // Tên/ảnh tác giả từ `GET /channels/:id/members` — thiếu thì mọi bong bóng hiện "Thành viên".
  const resolveAuthor = useChannelAuthors(chId);

  // p1-07: cùng cặp `knownLastReadSeq`/`onMarkedRead` mà `ConversationScreen` truyền cho `<ChatRoom>` — khác nguồn
  // dữ liệu vì kênh KHÔNG có field `lastReadSeq` riêng như `ConversationDetail`: mốc đọc kênh sống ở `/me/unread`
  // (`channels[chId].lastReadSeq`, BE trả từ 2026-09-26), không ở `ChannelDetail`.
  //
  // ⛔ ĐỪNG suy mốc từ số đếm (bản trước: `unread === 0 ? lastSeq : undefined`). `unread` của BE KHÔNG đếm tin của
  // chính mình và tin đã xoá, nên tin mới nhất trong kênh là tin MÌNH vừa gửi ⇒ `unread = 0` mà `lastReadSeq` vẫn
  // thấp hơn `lastSeq`. Đoán `lastSeq` trong ca đó làm `useReadMarker` khởi tạo `sentSeq` quá cao ⇒ không gửi
  // `POST /read-markers` nữa ⇒ `/me/unread/summary` (so `Channel.lastSeq > ReadState.lastReadSeq`) cứ đếm kênh này là
  // chưa đọc: huy hiệu thẻ nhóm / tab "Nhóm" / dòng "Kênh" ở tổng quan KẸT mãi dù hàng kênh bên trong đã sạch. Mốc
  // thật cũng là chỗ `ChatRoom` kẻ đường "Tin chưa đọc", nên trước đây kênh không bao giờ có đường kẻ đó.
  const queryClient = useQueryClient();
  const { data: workspaceUnread } = useWorkspaceUnread(wsId);
  const channelUnread = workspaceUnread?.channels[chId];
  const knownLastReadSeq = channelUnread?.lastReadSeq;
  const onMarkedRead = useCallback(
    (result: ReadMarkerResult) => {
      // Vá NGAY cache `/me/unread` mà `ChannelListScreen` đọc (`withChannelUnread`) — cùng hàm thuần đã dùng ở
      // đường chung (`useReadMarker`), gọi thêm ở đây để hàng kênh này hạ chấm mà không cần đợi lượt vá chung.
      queryClient.setQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread(wsId), (data) =>
        applyChannelRead(data, chId, result.lastReadSeq),
      );
    },
    [queryClient, wsId, chId],
  );

  // p1-06: `chat` không biết route của kênh (cần `wsId`) nên màn này nối điều hướng sang màn luồng. Chỉ đẩy route —
  // KHÔNG gọi API (TH-02: mở rồi đóng không được sinh `Thread`); không import feature `threads` (`feature-structure.md`).
  const openThread = useCallback(
    (message: MessageView) =>
      router.push({ params: { chId, messageId: message.id, wsId }, pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]' }),
    [chId, wsId],
  );

  const searchForwardTargets = useCallback(
    async (q: string) => {
      const items = await channelsService.search(wsId, q);
      return items.map((item) => ({ scopeType: 'CHANNEL' as const, scopeId: item.id, label: item.name }));
    },
    [wsId],
  );

  if (isLoading || status === 'pending') {
    return (
      <Screen padded={false} scrollable={false}>
        <View className="gap-sm p-md">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!channel) {
    return (
      <Screen padded={false} scrollable={false}>
        <EmptyState
          // "Thử lại" chỉ khi là LỖI tải; không kèm lỗi là không tìm thấy kênh — bấm thử lại chẳng ra gì.
          actions={error ? [{ label: 'Thử lại', onPress: refetch }] : undefined}
          description={error ? toErrorMessage(error) : 'Không tìm thấy kênh này.'}
          fullscreen
          // Không tìm thấy (mất quyền/đã xoá) là ổ khoá tông `warning`, không phải LỖI đỏ — quy ước `ScreenState`.
          icon={error ? 'alert-warning' : 'lock'}
          title={error ? 'Không tải được' : 'Không mở được kênh'}
          tone={error ? 'danger' : 'warning'}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<ChannelHeader channel={channel} wsId={wsId} />} padded={false} scrollable={false}>
      <View className="flex-1">
        {channel.visibility === 'PRIVATE' ? (
          <View className="p-md">
            <PrivateBanner />
          </View>
        ) : null}

        <ChatRoom
          capabilities={{ canWrite: channel.myPermissions.canWrite, hideReadOnlyNotice: true }}
          emptyHint="Chưa có tin nhắn nào — hãy là người đầu tiên nhắn trong kênh này."
          extension={{ canManage: channel.myPermissions.canManage, postingPolicy: channel.postingPolicy, workspaceId: wsId }}
          initialMessageId={m}
          knownLastReadSeq={knownLastReadSeq}
          resolveAuthor={resolveAuthor}
          scope={chatScope}
          searchForwardTargets={searchForwardTargets}
          onMarkedRead={onMarkedRead}
          onOpenThread={openThread}
        />
      </View>

      {!channel.myPermissions.canWrite ? <ChannelReadOnlyBar reason={resolveReadOnlyReason(channel)} /> : null}
    </Screen>
  );
}
