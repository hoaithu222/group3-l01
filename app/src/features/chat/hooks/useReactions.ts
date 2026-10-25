import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ChatScopeRef, ReactorPage } from '../api/chat.types';
import { patchMessageById, type MessagesData } from '../cache/message-pages';

export interface UseReactionsResult {
  /** ±1 + `me` lạc quan (app.md §4.5); khôi phục khi lỗi. */
  toggleReaction: (messageId: string, emoji: string, currentlyMine: boolean) => Promise<void>;
  listReactors: (messageId: string, emoji: string, cursor?: string) => Promise<ReactorPage>;
}

export function useReactions(scope: ChatScopeRef): UseReactionsResult {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string, currentlyMine: boolean): Promise<void> => {
      const previous = queryClient.getQueryData<MessagesData>(queryKey);
      if (previous) {
        queryClient.setQueryData<MessagesData>(
          queryKey,
          patchMessageById(previous, messageId, (m) => {
            const others = m.reactions.filter((r) => r.emoji !== emoji);
            const current = m.reactions.find((r) => r.emoji === emoji);
            const nextCount = (current?.count ?? 0) + (currentlyMine ? -1 : 1);
            return {
              ...m,
              reactions: nextCount > 0 ? [...others, { emoji, count: nextCount, me: !currentlyMine }] : others,
            };
          }),
        );
      }
      try {
        if (currentlyMine) await chatService.unreact(messageId, emoji);
        else await chatService.react(messageId, emoji);
      } catch (error) {
        if (previous) queryClient.setQueryData<MessagesData>(queryKey, previous);
        showToast('error', toErrorMessage(error));
      }
    },
    [queryClient, queryKey],
  );

  const listReactors = useCallback(
    (messageId: string, emoji: string, cursor?: string) => chatService.listReactors(messageId, emoji, cursor),
    [],
  );

  return { toggleReaction, listReactors };
}
