import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { chatKeys, subscribeMessageSent } from '@/features/chat';
import { socket, SocketEvent, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail } from '../api/conversations.types';
import {
  applyConversationActivity,
  applyConversationCreated,
  applyConversationRemoved,
  applyConversationUpdatedInDetail,
  applyConversationUpdatedInList,
  applyMemberUpdatedSelfInList,
  patchByActivity,
  shouldClearChatCache,
} from '../cache/apply-conversation-event';
import { patchByUpdate } from '../cache/apply-conversation-updated';
import { applySelfSettingsToSideCaches } from '../cache/apply-self-settings';
import {
  applyActivityToSideCaches,
  applyGroupMemberUpdate,
  forgetConversationSideCaches,
  listQueries,
  patchPinned,
} from '../cache/conversation-side-caches';
import type {
  ConversationActivityEvent,
  ConversationCreatedEvent,
  ConversationMemberUpdatedGroupEvent,
  ConversationMemberUpdatedSelfEvent,
  ConversationRemovedEvent,
  ConversationUpdatedEvent,
} from '../cache/conversation-socket-events.types';
import { bindActiveConversationAppState, isConversationOpenForeground } from '../store/active-conversation.store';

const INVALIDATE_DEBOUNCE_MS = 1000;

/** Vá mọi danh sách + "Đã ghim" + cache phụ theo một hoạt động mới; trả `true` nếu có danh sách chưa chứa hàng đó (cần tải lại). */
function applyActivityToCaches(queryClient: QueryClient, currentUserId: string | undefined, payload: ConversationActivityEvent): boolean {
  let needsInvalidate = false;
  const ctx = { currentUserId, isOpenForeground: isConversationOpenForeground(payload.conversationId) };
  for (const { key, data, filter } of listQueries(queryClient)) {
    const result = applyConversationActivity(data, filter, payload, ctx);
    if (result.outcome === 'updated') queryClient.setQueryData(key, result.data);
    if (result.outcome === 'invalidate') needsInvalidate = true;
  }
  patchPinned(queryClient, payload.conversationId, (item) => patchByActivity(item, payload, ctx));
  applyActivityToSideCaches(queryClient, payload);
  return needsInvalidate;
}

/**
 * Đồng bộ cache theo `conversation:*`/`read:receipt` (app.md §4.2) — mount
 * MỘT LẦN ở `(app)/_layout` (không chỉ khi mở tab `messages`) để badge/unread
 * đúng dù người dùng đang ở tab khác. Điều hướng-ra-khi-hội-thoại-ĐANG-MỞ-bị-xoá
 * là việc của `useConversationScope` (mount ở `[conversationId]/_layout.tsx`) —
 * cùng cách tách `useChannelSocket`/`useChannelScope` của p1-03.
 */
export function useConversationSocket(): void {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function scheduleInvalidate(): void {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    }, INVALIDATE_DEBOUNCE_MS);
  }

  /** app.md §4.2 "Reconnect: invalidate list trang 1 + pinned + detail đang mở" — đơn giản hoá thành làm mới toàn bộ `conversations` (an toàn hơn, chỉ tốn thêm vài request). */
  useEffect(() => {
    const onConnect = () => void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [queryClient]);

  // app.md §5 `activeConversationStore.isForeground` — theo dõi AppState SUỐT
  // vòng đời app (hook này chỉ mount MỘT LẦN ở `(app)/_layout`), không lệ
  // thuộc `ConversationScreen` có đang mount hay không.
  useEffect(() => bindActiveConversationAppState(), []);

  useSocketEvent<ConversationActivityEvent>(SocketEvent.CONVERSATION_ACTIVITY, (payload) => {
    if (applyActivityToCaches(queryClient, currentUserId, payload)) scheduleInvalidate();
  });

  // Tin MÌNH vừa gửi xong (HTTP 2xx): vá danh sách ngay thay vì đợi `conversation:activity` đi vòng outbox → worker → socket,
  // nên quay ra danh sách là thấy đúng tin gần nhất. Sự kiện socket tới sau vá lại y hệt (idempotent, tin của mình không tăng unread).
  useEffect(
    () =>
      subscribeMessageSent((view) => {
        if (view.scopeType !== 'CONVERSATION' || view.threadId !== null || view.authorId === null) return;
        const activity: ConversationActivityEvent = {
          v: 1,
          conversationId: view.scopeId,
          workspaceId: null,
          seq: view.seq,
          authorId: view.authorId,
          authorName: null,
          createdAt: view.createdAt,
          preview: (view.content ?? '').slice(0, 120),
          attachmentKind: view.attachments[0]?.kind ?? null,
        };
        if (applyActivityToCaches(queryClient, view.authorId, activity)) scheduleInvalidate();
      }),
    // `scheduleInvalidate` chỉ đụng ref + queryClient nên không cần là phụ thuộc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  );

  useSocketEvent<ConversationCreatedEvent>(SocketEvent.CONVERSATION_CREATED, (payload) => {
    for (const { key, data, filter } of listQueries(queryClient)) {
      queryClient.setQueryData(key, applyConversationCreated(data, filter, payload.conversation));
    }
    queryClient.setQueryData(conversationKeys.detail(payload.conversation.id), payload.conversation);
  });

  useSocketEvent<ConversationUpdatedEvent>(SocketEvent.CONVERSATION_UPDATED, (payload) => {
    for (const { key, data } of listQueries(queryClient)) {
      queryClient.setQueryData(key, applyConversationUpdatedInList(data, payload));
    }
    patchPinned(queryClient, payload.id, (item) => patchByUpdate(item, payload));
    const detail = queryClient.getQueryData<ConversationDetail>(conversationKeys.detail(payload.id));
    queryClient.setQueryData(conversationKeys.detail(payload.id), applyConversationUpdatedInDetail(detail, payload));
    // `settings` (ai được thêm người/ghim tin…) không vá được vào `myPermissions` phía máy — lấy lại bản server tính.
    if (payload.settings !== undefined) void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(payload.id) });
  });

  useSocketEvent<ConversationMemberUpdatedGroupEvent | ConversationMemberUpdatedSelfEvent>(
    SocketEvent.CONVERSATION_MEMBER_UPDATED,
    (payload) => {
      if ('userId' in payload) {
        applyGroupMemberUpdate(queryClient, payload.conversationId, payload.userId === currentUserId);
        return;
      }
      for (const { key, data, filter } of listQueries(queryClient)) {
        queryClient.setQueryData(key, applyMemberUpdatedSelfInList(data, filter, payload));
      }
      const detail = queryClient.getQueryData<ConversationDetail>(conversationKeys.detail(payload.conversationId));
      if (detail && shouldClearChatCache(detail.hiddenBeforeSeq, payload.hiddenBeforeSeq)) {
        queryClient.removeQueries({ queryKey: chatKeys.scope({ scopeType: 'CONVERSATION', scopeId: payload.conversationId }) });
      }
      applySelfSettingsToSideCaches(queryClient, payload);
    },
  );

  useSocketEvent<ConversationRemovedEvent>(SocketEvent.CONVERSATION_REMOVED, (payload) => {
    for (const { key, data } of listQueries(queryClient)) {
      queryClient.setQueryData(key, applyConversationRemoved(data, payload.conversationId));
    }
    queryClient.removeQueries({ queryKey: conversationKeys.detail(payload.conversationId) });
    queryClient.removeQueries({ queryKey: conversationKeys.members(payload.conversationId) });
    forgetConversationSideCaches(queryClient, payload.conversationId);
  });
}
