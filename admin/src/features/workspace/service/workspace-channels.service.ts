import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminChannelListParams,
  AdminChannelListResult,
  ChannelActionPayload,
} from '../types/workspace-channels.types';
import type { AdminChannelRow } from '../types/workspace-channels.types';
import { workspaceChannelsApi } from './workspace-channels.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceChannelsService = {
  list: async (
    workspaceId: string,
    params: AdminChannelListParams,
  ): Promise<ApiResponse<AdminChannelListResult>> =>
    (
      await apiClient.get<ApiResponse<AdminChannelListResult>>(
        workspaceChannelsApi.list(workspaceId),
        { params },
      )
    ).data,

  archive: async ({ channelId, reason }: ChannelActionPayload): Promise<ApiResponse<AdminChannelRow>> =>
    (
      await apiClient.post<ApiResponse<AdminChannelRow>>(workspaceChannelsApi.archive(channelId), {
        reason,
      })
    ).data,

  restore: async ({ channelId, reason }: ChannelActionPayload): Promise<ApiResponse<AdminChannelRow>> =>
    (
      await apiClient.post<ApiResponse<AdminChannelRow>>(workspaceChannelsApi.restore(channelId), {
        reason,
      })
    ).data,
};
