import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ReadMarkerResult } from '@/core/notifications';
import { ChatRoom, useChatScope } from '@/features/chat';
import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ConversationDetail } from '../api/conversations.types';
import { patchConversationRead } from '../cache/apply-conversation-read';
import { ConversationHeader } from '../components/ConversationHeader';
import { ReadOnlyBar } from '../components/ReadOnlyBar';
import { ReadReceiptFooter } from '../components/ReadReceiptFooter';
import { useConversationAuthors } from '../hooks/useConversationAuthors';
import { useConversationForwardTargets } from '../hooks/useConversationForwardTargets';
import { useConversationScope } from '../hooks/useConversationScope';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { conversationTitle } from '../utils/conversation-title';

function emptyHintFor(conversation: ConversationDetail): string {
  if (conversation.kind === 'DIRECT') return `Gửi lời chào tới ${conversationTitle(conversation)}`;
  return 'Nhóm vừa được tạo — hãy là người mở lời đầu tiên.';
}

/**
 * app.md §3 — payoff của cả module: gắn `<ChatRoom>` (p1-04, đã hoạt động
 * đầy đủ) vào scope `CONVERSATION` thật. Thanh tin đã ghim (`PinnedBar`, kiểu Zalo) do `ChatRoom` vẽ khi được truyền
 * `onOpenPinned` — màn này chỉ nối route danh sách `…/pins` (màn của `discovery`, `conversations` không import nó).
 */
export function ConversationScreen() {
  const { conversationId, m } = useLocalSearchParams<{ conversationId: string; m?: string }>();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { conversation, error, isLoading, refetch } = useConversationScope(conversationId);
  const chatScope = useChatScope('CONVERSATION', conversationId);
  const liveReceiptVersion = useReadReceipts(conversationId);
  // `chat` không sở hữu tên tác giả lẫn danh sách đích chuyển tiếp (`chat.types.ts`) —
  // thiếu hai thứ này thì bong bóng hiện "Thành viên" và ForwardSheet rỗng.
  const resolveAuthor = useConversationAuthors(conversation);
  const searchForwardTargets = useConversationForwardTargets();
  // p1-07: server nhận mốc đọc → hạ chấm/số chưa đọc của hàng danh sách + chi tiết ngay (không đợi refetch).
  const queryClient = useQueryClient();
  const onMarkedRead = useCallback(
    (result: ReadMarkerResult) => patchConversationRead(queryClient, conversationId, { lastReadSeq: result.lastReadSeq }),
    [queryClient, conversationId],
  );

  if (isLoading) {
    return (
      <Screen padded={false} scrollable={false}>
        {/* Khung xương dáng PHÒNG CHAT (thanh tên + bong bóng trái/phải xen kẽ) — không phải ba khối chữ nhật chung chung. */}
        <View accessibilityLabel="Đang mở cuộc trò chuyện" accessible className="gap-sm p-md">
          <View className="flex-row items-center gap-sm pb-xs">
            <Skeleton className="h-8 w-8" variant="circle" />
            <Skeleton width="40%" />
          </View>
          <Skeleton className="h-10 w-2/3 rounded-xs" />
          <Skeleton className="ml-auto h-10 w-1/2 rounded-xs" />
          <Skeleton className="h-16 w-3/4 rounded-xs" />
          <Skeleton className="ml-auto h-10 w-2/3 rounded-xs" />
        </View>
      </Screen>
    );
  }

  if (!conversation) {
    return (
      <Screen padded={false} scrollable={false}>
        <EmptyState
          // "Thử lại" chỉ khi là LỖI tải; không kèm lỗi là không tìm thấy hội thoại — bấm thử lại chẳng ra gì.
          actions={error ? [{ label: 'Thử lại', onPress: refetch }] : undefined}
          description={error ? toErrorMessage(error) : 'Không tìm thấy cuộc trò chuyện này.'}
          fullscreen
          // Lỗi tải ⇒ cảnh báo đỏ; không tìm thấy (đã rời/bị xoá/mất quyền) ⇒ khoá vàng — hai ca khác nhau thì hình cũng khác.
          icon={error ? 'alert-warning' : 'lock'}
          title={error ? 'Không tải được' : 'Không tìm thấy'}
          tone={error ? 'danger' : 'warning'}
        />
      </Screen>
    );
  }

  const canWrite = conversation.myPermissions.canSend;

  return (
    <Screen header={<ConversationHeader conversation={conversation} />} padded={false} scrollable={false}>
      <View className="flex-1">
        <ChatRoom
          // `ReadReceiptFooter` PHẢI vào khe `belowList` (giữa danh sách và ô soạn), không xếp dưới `ChatRoom`: ô soạn nâng theo
          // bàn phím bằng `transform` nên dải xếp dưới ở lại chỗ cũ và thành khoảng trống giữa ô soạn và bàn phím khi tin cuối là của mình.
          belowList={
            canWrite ? <ReadReceiptFooter conversation={conversation} currentUserId={currentUserId} liveVersion={liveReceiptVersion} /> : null
          }
          // `hideReadOnlyNotice`: `ReadOnlyBar` bên dưới đã nói lý do (kèm nút "Bỏ chặn") — không để `Composer` vẽ thêm thanh chung.
          capabilities={{ canWrite, hideReadOnlyNotice: true, readOnlyReason: conversation.readOnlyReason ?? undefined }}
          emptyHint={emptyHintFor(conversation)}
          initialMessageId={m}
          knownLastReadSeq={conversation.lastReadSeq}
          resolveAuthor={resolveAuthor}
          scope={chatScope}
          searchForwardTargets={searchForwardTargets}
          onMarkedRead={onMarkedRead}
          onOpenPinned={() => router.push({ pathname: '/messages/[conversationId]/pins', params: { conversationId } })}
        />
      </View>

      {!canWrite ? (
        <ReadOnlyBar
          peer={conversation.peer ? { userId: conversation.peer.userId, name: conversation.peer.name } : undefined}
          reason={conversation.readOnlyReason}
        />
      ) : null}
    </Screen>
  );
}
