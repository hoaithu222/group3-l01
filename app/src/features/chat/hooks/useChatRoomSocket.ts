import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { onRoomResync, scopeKeyOf, SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import type { RoomStatus } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { chatKeys } from '../api/chat.keys';
import type { ChatScopeRef, MessageView } from '../api/chat.types';
import {
  applyMessageCreated,
  applyMessageDeleted,
  applyMessageHidden,
  applyMessageUpdated,
  applyPinUpdated,
  applyReactionUpdated,
} from '../cache/apply-socket-event';
import { applyThreadUpdated } from '../cache/apply-thread-event';
import type {
  MessageCreatedEvent,
  MessageDeletedEvent,
  MessageHiddenEvent,
  MessageUpdatedEvent,
  PinUpdatedEvent,
  ReactionUpdatedEvent,
  ThreadUpdatedEvent,
} from '../cache/chat-socket-events.types';
import { maxLoadedSeq, type MessagesData } from '../cache/message-pages';
import { useOutboxStore } from '../store/outbox.store';
import { gapFillMessages, isFreshMessagesCache } from './gap-fill-messages';
import { refreshMessageCopies } from './refresh-message-copies';

const ROOM_KIND: Record<ChatScopeRef['scopeType'], string> = { CHANNEL: 'ch', CONVERSATION: 'conv' };

export interface UseChatRoomSocketOptions {
  /** Tin MỚI vừa được chèn vào cache — `useScrollAnchor`/`ChatRoom` quyết định tự cuộn hay tăng "N tin mới". */
  onMessageInserted?: (message: MessageView) => void;
}

/**
 * `joinRoom('ch'|'conv', scopeId)` theo vòng đời component (`useRoomSubscription`
 * đã tự refcount/blur/unmount → `room:leave`, app.md §4.4) + đồng bộ MỌI sự
 * kiện `message:*`/`reaction:updated`/`pin:updated` vào `chatKeys.messages(scope)`
 * qua các reducer thuần của `apply-socket-event.ts`. Gap-fill khi có lỗ `seq`
 * HOẶC ngay sau khi socket rejoin lại phòng (`onRoomResync`, p0-03).
 */
export function useChatRoomSocket(scope: ChatScopeRef, options: UseChatRoomSocketOptions = {}): RoomStatus {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const room = useRoomSubscription(ROOM_KIND[scope.scopeType], scope.scopeId);
  const queryKey = chatKeys.messages(scope);

  const onInsertedRef = useRef(options.onMessageInserted);
  useEffect(() => {
    onInsertedRef.current = options.onMessageInserted;
  });

  // ⛔ PHẢI có `.catch`: gap-fill chạy NGAY khi socket vừa nối lại/rejoin phòng — đúng lúc mạng hoặc server (Redis…) còn chập
  // chờn — nên `chatService.list` rất hay reject. Promise reject không ai bắt thì RN 0.86 ghi `console.error("Uncaught (in
  // promise…)")` ⇒ bản dev hiện thanh LogBox đỏ nằm đè lên thanh tab ("thanh trắng có dấu !" người dùng báo). Bắt xong thì tự lành:
  // đánh dấu cache cũ để React Query tải lại khi có mạng (toast lỗi mạng đã do interceptor axios lo, không toast thêm).
  const runGapFill = useCallback(
    (fromSeq: number) =>
      void gapFillMessages(queryClient, queryKey, scope, fromSeq).catch(() => {
        void queryClient.invalidateQueries({ queryKey });
      }),
    [queryClient, queryKey, scope],
  );

  useSocketEvent<MessageCreatedEvent>(SocketEvent.MESSAGE_CREATED, (payload) => {
    const current = queryClient.getQueryData<MessagesData>(queryKey);
    const result = applyMessageCreated(current, scope, currentUserId, payload);
    if (result.outcome === 'inserted') {
      queryClient.setQueryData<MessagesData>(queryKey, result.data);
      if (result.clientMessageId) {
        useOutboxStore.getState().remove(scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId), result.clientMessageId);
      }
      const inserted = result.data.pages.at(-1)?.data.at(-1);
      if (inserted) onInsertedRef.current?.(inserted);
    } else if (result.outcome === 'gap') {
      runGapFill(result.fromSeq);
    }
  });

  useSocketEvent<MessageUpdatedEvent>(SocketEvent.MESSAGE_UPDATED, (payload) => {
    queryClient.setQueryData<MessagesData>(queryKey, (data) => applyMessageUpdated(data, scope, payload));
    refreshMessageCopies(queryClient, scope, payload.id);
  });

  useSocketEvent<MessageDeletedEvent>(SocketEvent.MESSAGE_DELETED, (payload) => {
    queryClient.setQueryData<MessagesData>(queryKey, (data) => applyMessageDeleted(data, scope, payload));
    refreshMessageCopies(queryClient, scope, payload.id);
  });

  useSocketEvent<MessageHiddenEvent>(SocketEvent.MESSAGE_HIDDEN, (payload) => {
    const current = queryClient.getQueryData<MessagesData>(queryKey);
    const result = applyMessageHidden(current, scope, payload);
    if (result.outcome === 'removed') queryClient.setQueryData(queryKey, result.data);
    else if (result.outcome === 'invalidate') void queryClient.invalidateQueries({ queryKey });
  });

  useSocketEvent<ReactionUpdatedEvent>(SocketEvent.REACTION_UPDATED, (payload) => {
    queryClient.setQueryData<MessagesData>(queryKey, (data) => applyReactionUpdated(data, currentUserId, payload));
  });

  // Tóm tắt luồng chỉ nằm trên tin gốc ở LUỒNG CHÍNH của kênh — trong màn luồng (`threadId`) hay hội thoại thì bỏ qua.
  useSocketEvent<ThreadUpdatedEvent>(SocketEvent.THREAD_UPDATED, (payload) => {
    if (scope.scopeType !== 'CHANNEL' || scope.threadId !== undefined) return;
    queryClient.setQueryData<MessagesData>(queryKey, (data) => applyThreadUpdated(data, payload));
  });

  useSocketEvent<PinUpdatedEvent>(SocketEvent.PIN_UPDATED, (payload) => {
    queryClient.setQueryData<MessagesData>(queryKey, (data) => applyPinUpdated(data, scope, payload));
    void queryClient.invalidateQueries({ queryKey: chatKeys.pins(scope) });
  });

  useEffect(
    () =>
      onRoomResync(() => {
        const current = queryClient.getQueryData<MessagesData>(queryKey);
        runGapFill(maxLoadedSeq(current));
      }),
    [queryClient, queryKey, runGapFill],
  );

  // ⚠️ Mở lại phòng khi cache tin còn "tươi" (`useMessages` KHÔNG tải lại): lúc rời phòng socket không nhận tin của phòng này ⇒
  // thiếu đúng các tin đến trong lúc vắng. Chụp độ tươi LÚC MỞ (theo từng phạm vi — màn chia đôi đổi hội thoại không remount), rồi
  // bù MỘT lần sau lượt join đầu. Cache cũ thì `useMessages` tự tải lại, không gọi thừa. Nối lại socket: `onRoomResync` ở trên.
  const scopeKey = queryKey.join('/');
  const catchUp = useRef<{ done: boolean; fresh: boolean; scopeKey: string } | null>(null);
  useEffect(() => {
    if (catchUp.current?.scopeKey !== scopeKey) {
      catchUp.current = { done: false, fresh: isFreshMessagesCache(queryClient, queryKey), scopeKey };
    }
    const entry = catchUp.current;
    if (room.status !== 'joined' || entry.done) return;
    entry.done = true;
    const data = queryClient.getQueryData<MessagesData>(queryKey);
    if (!entry.fresh || !data || queryClient.getQueryState(queryKey)?.fetchStatus === 'fetching') return;
    runGapFill(maxLoadedSeq(data));
    void queryClient.invalidateQueries({ queryKey: chatKeys.pins(scope) });
  }, [queryClient, queryKey, room.status, runGapFill, scope, scopeKey]);

  return room;
}
