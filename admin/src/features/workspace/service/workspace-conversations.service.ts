import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminConversationListParams,
  AdminConversationListResult,
} from '../types/workspace-conversations.types';
import { workspaceConversationsApi } from './workspace-conversations.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceConversationsService = {
  list: async (
    workspaceId: string,
    params: AdminConversationListParams,
  ): Promise<ApiResponse<AdminConversationListResult>> =>
    (
      await apiClient.get<ApiResponse<AdminConversationListResult>>(
        workspaceConversationsApi.list(workspaceId),
        { params },
      )
    ).data,
};
