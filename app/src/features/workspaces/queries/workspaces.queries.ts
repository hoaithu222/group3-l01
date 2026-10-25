import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  workspacesService,
  type ArchiveWorkspacePayload,
  type CreateWorkspacePayload,
  type TransferOwnerPayload,
  type UpdateWorkspacePayload,
  type WorkspaceDetail,
  type WorkspaceListStatus,
  type WorkspaceMePayload,
} from '../api';
import {
  forgetWorkspace,
  refreshAfterNotifyModeChange,
  refreshAfterOwnerTransfer,
  refreshAfterWorkspaceEdit,
} from './workspace-cache';
import { workspaceKeys } from './workspaces.keys';

/** Danh sách nhóm của tôi — `staleTime` ngắn: unread/mention đổi liên tục. */
export function useWorkspaces(status: WorkspaceListStatus = 'ACTIVE') {
  return useQuery({
    queryKey: workspaceKeys.list(status),
    queryFn: () => workspacesService.list(status),
    staleTime: 30_000,
  });
}

export function useWorkspace(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId ?? ''),
    queryFn: () => workspacesService.get(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useWorkspaceOverview(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.overview(workspaceId ?? ''),
    queryFn: () => workspacesService.overview(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 10_000,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateWorkspacePayload;
      idempotencyKey: string;
    }) => workspacesService.create(payload, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

/** Optimistic tên/mô tả — 409 `RES_003` thì rollback, giữ nguyên form (app.md §4). */
export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  const detailKey = workspaceKeys.detail(workspaceId);

  return useMutation({
    mutationFn: (payload: UpdateWorkspacePayload) => workspacesService.update(workspaceId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<WorkspaceDetail>(detailKey);
      if (previous) {
        queryClient.setQueryData<WorkspaceDetail>(detailKey, {
          ...previous,
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.description !== undefined && { description: payload.description }),
        });
      }
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(detailKey, updated);
      refreshAfterWorkspaceEdit(queryClient, workspaceId);
    },
  });
}

export function useWorkspaceMe(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WorkspaceMePayload) => workspacesService.updateMe(workspaceId, payload),
    onSuccess: (_result, payload) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      if (payload.notifyMode !== undefined) refreshAfterNotifyModeChange(queryClient, workspaceId);
    },
  });
}

export function useArchiveWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ArchiveWorkspacePayload) => workspacesService.archive(workspaceId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(workspaceKeys.detail(workspaceId), updated);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useRestoreWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (expectedVersion: number) => workspacesService.restore(workspaceId, expectedVersion),
    onSuccess: (updated) => {
      queryClient.setQueryData(workspaceKeys.detail(workspaceId), updated);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useTransferOwner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TransferOwnerPayload) => workspacesService.transferOwner(workspaceId, payload),
    onSuccess: () => refreshAfterOwnerTransfer(queryClient, workspaceId),
  });
}

/** `onSuccess` xoá mọi query trong phạm vi workspace này — màn gọi tự điều hướng về `/workspaces`. */
export function useLeaveWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workspacesService.leave(workspaceId),
    onSuccess: () => forgetWorkspace(queryClient, workspaceId),
  });
}
