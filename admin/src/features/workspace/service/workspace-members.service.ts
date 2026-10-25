import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminListMembersParams,
  AdminMemberRow,
  RevokeMemberPayload,
} from '../types/workspace-members.types';
import { workspaceMembersApi } from './workspace-members.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceMembersService = {
  list: async (
    workspaceId: string,
    params: AdminListMembersParams,
  ): Promise<ApiResponse<AdminMemberRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminMemberRow[]>>(workspaceMembersApi.list(workspaceId), {
        params,
      })
    ).data,

  revoke: async ({ workspaceId, userId, reason, ban }: RevokeMemberPayload): Promise<ApiResponse<null>> =>
    (
      await apiClient.post<ApiResponse<null>>(workspaceMembersApi.revoke(workspaceId, userId), {
        reason,
        ban,
      })
    ).data,
};
