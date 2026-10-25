import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat';
import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail } from '../api/conversations.types';
import type { ConversationRemovedEvent } from '../cache/conversation-socket-events.types';
import { useActiveConversationStore } from '../store/active-conversation.store';
import { useConversationDetail } from './useConversationDetail';

const REMOVED_TOAST_MESSAGE = 'Bạn không còn trong cuộc trò chuyện này';

export interface UseConversationScopeResult {
  conversation: ConversationDetail | undefined;
  error: unknown;
  isLoading: boolean;
  /** Tải lại chi tiết hội thoại — nút "Thử lại" của màn khi tải lỗi. */
  refetch: () => void;
  status: 'denied' | 'joined' | 'pending';
}

/**
 * Phạm vi MỘT hội thoại đang mở (app.md §3 bảng "Mất quyền", §5) — mount ở
 * `[conversationId]/_layout.tsx`, cùng mẫu `useChannelScope` (p1-03).
 *
 *  · `room:join` (`conv:{id}`) qua `useRoomSubscription` — ack lỗi (`denied`)
 *    xử lý NHƯ mất quyền.
 *  · `conversation:removed` tới ĐÚNG hội thoại này → dọn cache + điều hướng
 *    `/messages` + toast trung tính. `conversation:updated` (dissolve/archive)
 *    KHÔNG điều hướng — hội thoại giải tán vẫn đọc được (be.md §5.5).
 *  · `activeConversationStore.id` = id này SUỐT lúc màn mở — `useConversationSocket`
 *    (mount cao hơn) dùng để quyết định có tăng `unreadCount` hay không.
 */
export function useConversationScope(conversationId: string): UseConversationScopeResult {
  const queryClient = useQueryClient();
  const room = useRoomSubscription('conv', conversationId);
  const detailQuery = useConversationDetail(conversationId);

  const leaveToList = useCallback(() => {
    queryClient.removeQueries({ queryKey: conversationKeys.detail(conversationId) });
    queryClient.removeQueries({ queryKey: conversationKeys.members(conversationId) });
    queryClient.removeQueries({ queryKey: chatKeys.scope({ scopeType: 'CONVERSATION', scopeId: conversationId }) });
    router.replace('/messages');
    showToast('info', REMOVED_TOAST_MESSAGE);
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (room.status === 'denied') leaveToList();
  }, [leaveToList, room.status]);

  useSocketEvent<ConversationRemovedEvent>(SocketEvent.CONVERSATION_REMOVED, (payload) => {
    if (payload.conversationId === conversationId) leaveToList();
  });

  useEffect(() => {
    useActiveConversationStore.getState().setActive(conversationId);
    return () => useActiveConversationStore.getState().setActive(null);
  }, [conversationId]);

  return {
    conversation: detailQuery.data,
    error: detailQuery.error,
    isLoading: detailQuery.isLoading,
    refetch: () => void detailQuery.refetch(),
    status: room.status,
  };
}
