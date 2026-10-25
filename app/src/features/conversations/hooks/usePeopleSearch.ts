import { useQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';

/** `NewConversationScreen`/bước 2 của `CreateGroupScreen` — `GET /conversations/people` (be.md §4), debounce ở màn gọi. */
export function usePeopleSearch(q: string, workspaceId?: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: conversationKeys.people(`${workspaceId ?? ''}:${trimmed}`),
    queryFn: () => conversationsService.people(trimmed, workspaceId),
    staleTime: 30_000,
  });
}
