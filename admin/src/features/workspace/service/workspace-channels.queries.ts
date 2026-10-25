import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { AdminChannelListParams, ChannelActionPayload } from '../types/workspace-channels.types';
import { workspaceChannelsService } from './workspace-channels.service';

export const workspaceChannelsKeys = {
  all: (workspaceId: string) => ['workspace', 'channels', workspaceId] as const,
  list: (workspaceId: string, params: AdminChannelListParams) =>
    ['workspace', 'channels', workspaceId, params] as const,
};

export const useAdminWorkspaceChannels = (workspaceId: string, params: AdminChannelListParams) =>
  useQuery({
    queryKey: workspaceChannelsKeys.list(workspaceId, params),
    queryFn: () => workspaceChannelsService.list(workspaceId, params),
    enabled: !!workspaceId,
  });

export const useArchiveChannel = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChannelActionPayload) => workspaceChannelsService.archive(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceChannelsKeys.all(workspaceId) });
      showToast('success', 'Đã lưu trữ kênh và ghi nhật ký');
    },
  });
};

export const useRestoreChannel = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChannelActionPayload) => workspaceChannelsService.restore(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceChannelsKeys.all(workspaceId) });
      showToast('success', 'Đã khôi phục kênh và ghi nhật ký');
    },
  });
};
