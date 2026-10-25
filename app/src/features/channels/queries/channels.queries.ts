import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  channelsService,
  type ArchiveChannelPayload,
  type ChannelDetail,
  type ChannelListResponse,
  type CreateChannelPayload,
  type UpdateChannelPayload,
} from '../api';
import { insertRestoredChannel, refreshAfterStatusChange, syncListItem } from './channel-list-cache';
import { channelKeys } from './channels.keys';

/** Danh sách "Kênh của bạn"/"Khám phá" — MỘT lượt gọi trả cả hai (app.md §4). */
export function useChannels(wsId: string) {
  return useQuery({
    queryKey: channelKeys.list(wsId),
    queryFn: () => channelsService.list(wsId),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

export function useChannel(chId: string | undefined) {
  return useQuery({
    queryKey: channelKeys.detail(chId ?? ''),
    queryFn: () => channelsService.get(chId as string),
    enabled: Boolean(chId),
    staleTime: 30_000,
  });
}

/** `GET /channels/search` chỉ gọi khi ≥ 2 ký tự (app.md §3 — dưới ngưỡng đó chỉ lọc client). */
export function useChannelSearch(wsId: string, q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: channelKeys.search(wsId, trimmed),
    queryFn: () => channelsService.search(wsId, trimmed),
    enabled: Boolean(wsId) && trimmed.length >= 2,
    staleTime: 10_000,
  });
}

export function useCreateChannel(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateChannelPayload;
      idempotencyKey: string;
    }) => channelsService.create(wsId, payload, idempotencyKey),
    onSuccess: (created) => {
      queryClient.setQueryData<ChannelListResponse>(channelKeys.list(wsId), (prev) =>
        prev ? { ...prev, joined: [created, ...prev.joined] } : prev,
      );
      queryClient.setQueryData<ChannelDetail>(channelKeys.detail(created.id), created);
    },
  });
}

/** Optimistic tên/mô tả/policy — 409 `RES_003` thì rollback, giữ nguyên form (app.md §3). */
export function useUpdateChannel(chId: string, wsId: string) {
  const queryClient = useQueryClient();
  const detailKey = channelKeys.detail(chId);

  return useMutation({
    mutationFn: (payload: UpdateChannelPayload) => channelsService.update(chId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<ChannelDetail>(detailKey);
      if (previous) {
        queryClient.setQueryData<ChannelDetail>(detailKey, {
          ...previous,
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.description !== undefined && { description: payload.description }),
          ...(payload.postingPolicy !== undefined && { postingPolicy: payload.postingPolicy }),
        });
      }
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(detailKey, updated);
      syncListItem(queryClient, wsId, updated);
    },
  });
}

export function useArchiveChannel(chId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ArchiveChannelPayload) => channelsService.archive(chId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(channelKeys.detail(chId), updated);
      syncListItem(queryClient, wsId, updated);
      refreshAfterStatusChange(queryClient, wsId);
    },
  });
}

export function useRestoreChannel(chId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (expectedVersion: number) => channelsService.restore(chId, expectedVersion),
    onSuccess: (updated) => {
      queryClient.setQueryData(channelKeys.detail(chId), updated);
      syncListItem(queryClient, wsId, updated);
      refreshAfterStatusChange(queryClient, wsId);
    },
  });
}

/**
 * Khôi phục kênh ARCHIVED trùng tên khi `CH_001` báo `details.archivedChannelId`
 * (app.md §3, `NameStep`). Restore cần `expectedVersion` mà lỗi tạo kênh không
 * mang theo — tự `get()` trước để lấy version mới nhất rồi mới `restore()`.
 */
export function useRestoreArchivedDuplicate(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) => {
      const detail = await channelsService.get(channelId);
      return channelsService.restore(channelId, detail.version);
    },
    onSuccess: (restored) => {
      queryClient.setQueryData(channelKeys.detail(restored.id), restored);
      insertRestoredChannel(queryClient, wsId, restored);
      refreshAfterStatusChange(queryClient, wsId);
    },
  });
}
