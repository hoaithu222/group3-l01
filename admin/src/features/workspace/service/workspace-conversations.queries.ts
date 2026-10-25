import { useQuery } from '@tanstack/react-query';

import type { AdminConversationListParams } from '../types/workspace-conversations.types';
import { workspaceConversationsService } from './workspace-conversations.service';

/** admin.md p1-05 §3 — `['workspace','conversations',workspaceId,params]`. */
export const workspaceConversationKeys = {
  all: (workspaceId: string) => ['workspace', 'conversations', workspaceId] as const,
  list: (workspaceId: string, params: AdminConversationListParams) =>
    ['workspace', 'conversations', workspaceId, params] as const,
};

export const useAdminWorkspaceConversations = (
  workspaceId: string,
  params: AdminConversationListParams,
) =>
  useQuery({
    queryKey: workspaceConversationKeys.list(workspaceId, params),
    queryFn: () => workspaceConversationsService.list(workspaceId, params),
    enabled: !!workspaceId,
  });
