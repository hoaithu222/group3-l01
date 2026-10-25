import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { chatKeys, flattenMessages, type ChatScopeRef, type MessagesData } from '@/features/chat';
import { onRoomResync, useSocketEvent } from '@/core/socket';

import { CHAT_EXT_EVENTS } from '../api/chat-extensions.api';
import { pollKeys } from '../api/chat-extensions.keys';
import type { PollUpdatedEvent } from '../api/chat-extensions.types';
import { pollService } from '../api/poll.service';
import { applyPollEvent, mergeServerPoll, patchPollInMessages } from '../utils/poll-cache';

/** Sau khi nối lại phòng chỉ đồng bộ lại tối đa chừng này khảo sát ĐANG MỞ (mới nhất trước) — một phòng có cả trăm khảo sát cũ không được bắn cả trăm request. */
const RESYNC_MAX = 20;

/**
 * Realtime của khảo sát trong MỘT phòng chat (`poll:updated` tới `ch:{id}`/`conv:{id}` — phòng mà `useChatRoomSocket` đã tham gia; ở đây chỉ NGHE):
 *  · sự kiện → vá `message.poll` trong cache tin nhắn của phòng này (`applyPollEvent`: bỏ bản `version` cũ, giữ `myOptionIds`) và làm mới danh sách người bầu đang mở;
 *  · nối lại phòng (`onRoomResync`) → tải lại các khảo sát đang mở. Gap-fill của `chat` chỉ kéo tin MỚI, không làm mới số phiếu của tin đã có — sự kiện lỡ lúc mất mạng không phát lại.
 * BE giới hạn ~1 sự kiện/giây/khảo sát (throttle) nên không cần gộp thêm ở đây.
 */
export function usePollSocket(scope: ChatScopeRef): void {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  useSocketEvent<PollUpdatedEvent>(CHAT_EXT_EVENTS.POLL_UPDATED, (event) => {
    if (event.scopeType !== scope.scopeType || event.scopeId !== scope.scopeId) return;
    queryClient.setQueryData<MessagesData>(queryKey, (data) =>
      patchPollInMessages(data, event.messageId, (poll) => applyPollEvent(poll, event)),
    );
    void queryClient.invalidateQueries({ queryKey: pollKeys.votersOf(event.pollId) });
  });

  useEffect(
    () =>
      onRoomResync(() => {
        const open = flattenMessages(queryClient.getQueryData<MessagesData>(queryKey))
          .flatMap((m) => (m.poll?.status === 'OPEN' ? [{ messageId: m.id, pollId: m.poll.id }] : []))
          .slice(-RESYNC_MAX);
        for (const { messageId, pollId } of open) {
          // ⛔ PHẢI `.catch`: chạy ngay lúc mạng/server còn chập chờn — reject không ai bắt là LogBox đỏ trong bản dev (cùng lý do `useChatRoomSocket`).
          void pollService
            .get(pollId)
            .then((server) =>
              queryClient.setQueryData<MessagesData>(queryKey, (data) =>
                patchPollInMessages(data, messageId, (poll) => mergeServerPoll(poll, server)),
              ),
            )
            .catch(() => undefined);
        }
      }),
    [queryClient, queryKey],
  );
}
