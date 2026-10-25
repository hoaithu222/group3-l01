import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { notificationKeys } from '@/core/notifications';
import { showToast } from '@/shared/utils/toast.utils';

import {
  threadsService,
  type ThreadListFilter,
  type ThreadRootResult,
  type ThreadSubscriptionState,
} from '../api';
import { setMySubscription } from '../utils/thread-cache';
import { threadKeys } from './threads.keys';

type ExplicitState = Extract<ThreadSubscriptionState, 'EXPLICIT_ON' | 'EXPLICIT_OFF'>;

/** BE mặc định 20, tối đa 50 (`threadListQuerySchema`) — 20 vừa một màn dài mà không kéo nhiều tin gốc cùng lúc (mỗi hàng tra tin gốc riêng, `useThreadByRoot`). */
const THREAD_LIST_PAGE_SIZE = 20;

/**
 * Danh sách luồng của MỘT kênh theo bộ lọc, phân trang cursor (mới trả lời nhất trước). `retry: false` + lỗi hiện ở màn (`ScreenState` + Thử lại): 403/404 (mất quyền kênh, cờ `communication` tắt) thử lại
 * vẫn vậy. Làm mới bởi `useThreadListSync` (socket) và `useRefetchOnFocus` ở màn.
 */
export function useChannelThreads(channelId: string, filter: ThreadListFilter) {
  return useInfiniteQuery({
    queryKey: threadKeys.list(channelId, filter),
    queryFn: ({ pageParam }) =>
      threadsService.listByChannel(channelId, { filter, cursor: pageParam, limit: THREAD_LIST_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: Boolean(channelId),
    retry: false,
    staleTime: 15_000,
  });
}

export function useThreadByRoot(rootId: string) {
  return useQuery({
    queryKey: threadKeys.byRoot(rootId),
    queryFn: () => threadsService.getByRoot(rootId),
    enabled: Boolean(rootId),
    staleTime: 15_000,
    retry: 1,
  });
}

/** Tên + quyền gửi của kênh — lỗi thì màn luồng dựa vào `root.myPermissions.canReply`, không chặn cả màn. */
export function useThreadChannel(channelId: string) {
  return useQuery({
    queryKey: threadKeys.channel(channelId),
    queryFn: () => threadsService.getChannelBrief(channelId),
    enabled: Boolean(channelId),
    staleTime: 60_000,
    retry: false,
  });
}

/** Danh bạ tên/ảnh của kênh — nơi gọi (`useThreadAuthors`) tự kéo hết các trang. */
export function useThreadAuthorDirectory(channelId: string) {
  return useInfiniteQuery({
    queryKey: threadKeys.authors(channelId),
    queryFn: ({ pageParam }) => threadsService.listChannelMembers(channelId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: Boolean(channelId),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Theo dõi/bỏ theo dõi — đổi nhãn LẠC QUAN, lỗi thì khôi phục + toast (app.md p1-06 §4.3). `threadId` (=`Thread.id`)
 * do nơi gọi lấy từ cache `byRoot`: chưa có luồng (chưa ai trả lời) thì không có gì để theo dõi.
 */
export function useSetThreadSubscription(rootId: string) {
  const queryClient = useQueryClient();
  const key = threadKeys.byRoot(rootId);

  return useMutation({
    mutationFn: ({ threadId, state }: { threadId: string; state: ExplicitState }) =>
      threadsService.setSubscription(threadId, state),
    onMutate: async ({ state }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ThreadRootResult>(key);
      queryClient.setQueryData<ThreadRootResult>(key, (data) => setMySubscription(data, state));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData<ThreadRootResult>(key, context.previous);
      showToast('error', toErrorMessage(error));
    },
    // Bỏ/bật theo dõi đổi số "N mới" của luồng và số chưa đọc của kênh (tính theo luồng đang theo dõi) — lấy số chuẩn của server.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.workspaceUnreadAll }),
  });
}
