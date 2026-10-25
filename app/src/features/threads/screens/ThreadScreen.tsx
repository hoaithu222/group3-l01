import { type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { ChatRoom, useChatScope } from '@/features/chat';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { FollowToggle } from '../components/FollowToggle';
import { ThreadRootHeader } from '../components/ThreadRootHeader';
import { useThreadAuthors } from '../hooks/useThreadAuthors';
import { useThreadSocket } from '../hooks/useThreadSocket';
import {
  useSetThreadSubscription,
  useThreadByRoot,
  useThreadChannel,
} from '../queries/threads.queries';
import { isFollowing } from '../utils/thread-cache';

/**
 * Màn LUỒNG của một tin gốc ở kênh (p1-06 app.md §3): `ThreadRootHeader` ghim trên + `<ChatRoom>` ở scope
 * `{ CHANNEL, chId, threadId: messageId }` — tái dùng NGUYÊN engine tin nhắn (danh sách, composer, gửi lạc
 * quan, reaction, chuyển tiếp…) thay vì viết bản thứ hai. Nháp riêng theo khoá `CHANNEL:<ch>:<root>`, nên
 * quay lại kênh vẫn giữ nháp của kênh (WS-02).
 *
 * TH-02: MỞ màn không gọi POST nào — luồng chỉ được tạo khi có reply đầu tiên được gửi. Vì vậy chưa có luồng
 * (`thread: null`) thì không có `FollowToggle` (không có gì để theo dõi; tự trả lời thì BE tự bật `AUTO_ON`).
 * Mất quyền kênh (`channel:revoked`) do `[chId]/_layout.tsx` (p1-03) điều hướng — màn này không tự xử lý.
 *
 * Tên/ảnh tác giả: `threads` không được import feature `channels`, nên tự dựng danh bạ từ cùng endpoint
 * `GET /channels/:id/members` (`useThreadAuthors`) — một lượt tải thứ hai của danh bạ, đổi lấy ranh giới feature sạch.
 */
export function ThreadScreen() {
  const { wsId, chId, messageId, m } = useLocalSearchParams<{
    wsId: string;
    chId: string;
    messageId: string;
    m?: string;
  }>();
  const chatScope = useChatScope('CHANNEL', chId, messageId);
  const threadQuery = useThreadByRoot(messageId);
  const channelQuery = useThreadChannel(chId);
  const setSubscription = useSetThreadSubscription(messageId);
  const resolveAuthor = useThreadAuthors(chId);
  useThreadSocket(messageId);

  const summary = threadQuery.data?.thread ?? null;
  // Mốc đọc của luồng do `<ChatRoom>` đặt (p1-07: viewability → `POST /read-markers { THREAD }`), không phải màn này.

  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ params: { chId, wsId }, pathname: '/workspaces/[wsId]/channels/[chId]' });
  const header = (actions?: ReactNode) => (
    <AppBar actions={actions} subtitle={channelQuery.data?.name} title="Luồng" onBack={goBack} />
  );

  if (threadQuery.isLoading) {
    return (
      <Screen header={header()} padded={false} scrollable={false}>
        <View className="gap-sm p-md">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!threadQuery.data) {
    return (
      <Screen header={header()} padded={false} scrollable={false}>
        {/* Lỗi tải ⇒ cảnh báo đỏ + "Thử lại"; không tìm thấy (không kèm lỗi) ⇒ khoá vàng, KHÔNG "Thử lại" — bấm lại vẫn không có gì. */}
        <EmptyState
          actions={
            threadQuery.error
              ? [{ label: 'Thử lại', onPress: () => void threadQuery.refetch() }]
              : undefined
          }
          description={
            threadQuery.error ? toErrorMessage(threadQuery.error) : 'Không tìm thấy luồng này.'
          }
          fullscreen
          icon={threadQuery.error ? 'alert-warning' : 'lock'}
          title={threadQuery.error ? 'Không tải được' : 'Không tìm thấy'}
          tone={threadQuery.error ? 'danger' : 'warning'}
        />
      </Screen>
    );
  }

  const { root } = threadQuery.data;
  const rootAuthor = root.authorId ? resolveAuthor(root.authorId) : undefined;
  const following = isFollowing(summary?.mySubscription);
  // Kênh là nguồn đúng về quyền gửi (gồm cả tin gốc đã thu hồi mà luồng vẫn trả lời được); chưa tải xong thì
  // tạm dựa `canReply` của tin gốc — tin gốc thu hồi có `canReply=false` nên khoảnh khắc đầu composer có thể khoá.
  const canWrite = channelQuery.data?.myPermissions.canWrite ?? root.myPermissions.canReply;

  return (
    <Screen
      header={header(
        summary ? (
          <FollowToggle
            following={following}
            loading={setSubscription.isPending}
            onToggle={() =>
              setSubscription.mutate({
                threadId: summary.id,
                state: following ? 'EXPLICIT_OFF' : 'EXPLICIT_ON',
              })
            }
          />
        ) : undefined,
      )}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        <ThreadRootHeader
          authorAvatarUrl={rootAuthor?.avatarUrl}
          authorName={rootAuthor?.name}
          root={root}
        />
        <ChatRoom
          capabilities={{ canWrite }}
          emptyHint="Chưa có phản hồi. Hãy bắt đầu cuộc thảo luận."
          initialMessageId={m}
          resolveAuthor={resolveAuthor}
          scope={chatScope}
        />
      </View>
    </Screen>
  );
}
