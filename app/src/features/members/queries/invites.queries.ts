import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import { invitesService, type CreateInvitePayload, type InviteListPage } from '../api';
import { pendingInviteStore } from '../store/pending-invite';
import { memberKeys } from './members.keys';

/** Một query cursor DUY NHẤT cho cả workspace — màn tự lọc "đang hoạt động"/"đã hết" tại chỗ (app.md §3). */
export function useInvites(wsId: string) {
  return useInfiniteQuery({
    queryKey: memberKeys.invites(wsId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => invitesService.list(wsId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor ?? undefined : undefined),
    enabled: Boolean(wsId),
    staleTime: 15_000,
  });
}

/** `onSuccess` KHÔNG lưu `url` trả về vào cache — chỉ invalidate danh sách (app.md §4). */
export function useCreateInvite(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInvitePayload) => invitesService.create(wsId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.invites(wsId) });
    },
  });
}

export function useRevokeInvite(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => invitesService.revoke(wsId, inviteId),
    onSuccess: (_result, inviteId) => {
      queryClient.setQueriesData<InfiniteData<InviteListPage>>(
        { queryKey: memberKeys.invites(wsId) },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((row) =>
                    row.id === inviteId ? { ...row, status: 'REVOKED' as const } : row,
                  ),
                })),
              }
            : data,
      );
    },
  });
}

/** `retry: false` — 410/403/404 là trạng thái nghiệp vụ, thử lại không đổi kết quả (app.md §4). */
export function useInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: memberKeys.invitePreview(code ?? ''),
    queryFn: () => invitesService.preview(code as string),
    enabled: Boolean(code),
    retry: false,
  });
}

/**
 * `onSuccess`: xoá `pendingInvite`, mời `workspaces.list` tải lại (nhóm mới vào
 * hiện ngay trong tab "Nhóm"), và mời luôn danh sách thành viên của nhóm đó —
 * người vừa join thấy mình trong danh sách nếu quay lại màn Thành viên ngay.
 * Socket `member:updated` tới `ws:{id}` cho các thiết bị khác (app.md §4).
 */
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestMessage, token }: { requestMessage?: string; token: string }) =>
      invitesService.accept(token, { requestMessage }),
    onSuccess: async (result) => {
      await pendingInviteStore.clear();
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'list'] });
      void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(result.workspaceId) });
    },
  });
}
