import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import { joinRequestsService, type JoinRequestListPage } from '../api';
import { readErrorInfo } from '../utils/error-info';
import { joinRequestKeys } from './invitations.keys';
import { memberKeys } from './members.keys';

export function useJoinRequests(wsId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: joinRequestKeys.list(wsId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => joinRequestsService.list(wsId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(wsId) && enabled,
    staleTime: 15_000,
  });
}

function removeRequest(
  data: InfiniteData<JoinRequestListPage> | undefined,
  userId: string,
): InfiniteData<JoinRequestListPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.filter((row) => row.user.id !== userId) })),
  };
}

interface DecideVariables {
  userId: string;
  decision: 'approve' | 'reject';
  reason?: string;
}

/**
 * Duyệt/từ chối với gỡ dòng LẠC QUAN (app.md §4). Lỗi 409 (người khác đã xử
 * lý) thì GIỮ nguyên việc gỡ — dòng đó không còn PENDING nữa, hoàn lại chỉ để
 * người dùng bấm lần nữa vào một yêu cầu đã chết; mọi lỗi khác thì hoàn lại.
 */
export function useDecideJoinRequest(wsId: string) {
  const queryClient = useQueryClient();
  const queryKey = joinRequestKeys.list(wsId);

  return useMutation({
    mutationFn: ({ userId, decision, reason }: DecideVariables) =>
      joinRequestsService.decide(wsId, userId, decision, reason),
    onMutate: async ({ userId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<JoinRequestListPage>>(queryKey);
      queryClient.setQueryData<InfiniteData<JoinRequestListPage>>(queryKey, removeRequest(previous, userId));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (readErrorInfo(error).status === 409) return;
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey });
      // Duyệt ⇒ người đó thành thành viên ACTIVE: danh sách thành viên/đếm phải tải lại.
      if (variables.decision === 'approve') {
        void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(wsId) });
        void queryClient.invalidateQueries({ queryKey: ['workspaces', 'overview', wsId] });
      }
    },
  });
}
