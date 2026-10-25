import { useInfiniteQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { MediaKind } from '../api/conversations.types';

/** `GET /conversations/:id/media` (be.md §5.10) — cursor theo `seq` của tin, trang 30 mục (media/file), 30 liên kết. */
export function useConversationMedia(conversationId: string, kind: MediaKind) {
  return useInfiniteQuery({
    queryKey: conversationKeys.media(conversationId, kind),
    queryFn: ({ pageParam }) => conversationsService.media(conversationId, kind, pageParam, 30),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: Boolean(conversationId),
    staleTime: 60_000,
  });
}
