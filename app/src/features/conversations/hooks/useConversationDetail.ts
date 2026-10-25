import { useQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';

export function useConversationDetail(id: string | undefined) {
  return useQuery({
    queryKey: conversationKeys.detail(id ?? ''),
    queryFn: () => conversationsService.get(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
