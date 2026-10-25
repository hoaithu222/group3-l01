import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';

import { blocksService } from '../api/blocks.service';
import { moderationKeys } from '../api/moderation.keys';
import type { BlocksPage } from '../api/moderation.types';

const PAGE_SIZE = 50;

/**
 * Danh sách người đã chặn (cursor). `meta.allIds` của trang đầu nạp `useBlockedIds`
 * (`useBlockedSync`); màn `me/blocked` dùng chính cache này để vẽ danh sách.
 *
 * `staleTime` 5 phút (app.md §4): socket `block:updated` giữ cho nó tươi trong lúc app mở, nên
 * không cần gọi lại mỗi lần vào màn.
 */
export function useBlocks(options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: moderationKeys.blocks,
    queryFn: ({ pageParam }) => blocksService.list(pageParam, PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

/**
 * Chặn — LẠC QUAN: đưa id vào tập ngay để tin của họ thu gọn tức thì, hỏng thì trả lại.
 *
 * ⚠️ `cancelQueries` TRƯỚC khi sửa tập: một lượt tải danh sách bay dở (trả về bản TRƯỚC khi chặn)
 * mà về sau `onMutate` sẽ `hydrate()` đè mất id vừa thêm — tin vừa thu gọn bung ra lại một nhịp.
 */
export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => blocksService.block(userId),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: moderationKeys.blocks });
      const store = useBlockedUsersStore.getState();
      const wasBlocked = store.ids.has(userId);
      store.add(userId);
      return { wasBlocked };
    },
    onError: (_error, userId, context) => {
      // Đã chặn từ trước (idempotent) thì lỗi không được gỡ nó khỏi tập.
      if (!context?.wasBlocked) useBlockedUsersStore.getState().remove(userId);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: moderationKeys.blocks }),
  });
}

type BlocksData = InfiniteData<BlocksPage, string | undefined>;

/** Bản cache danh sách đã bỏ một người (cả `data` lẫn `meta.allIds`) — để dòng biến mất NGAY khi bỏ chặn. */
function withoutUser(data: BlocksData | undefined, userId: string): BlocksData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      data: page.data.filter((user) => user.userId !== userId),
      meta: { ...page.meta, allIds: page.meta.allIds.filter((id) => id !== userId) },
    })),
  };
}

/** Bỏ chặn — lạc quan cả tập `useBlockedIds` lẫn danh sách `me/blocked`; hỏng thì trả cả hai. */
export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => blocksService.unblock(userId),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: moderationKeys.blocks });
      const store = useBlockedUsersStore.getState();
      const wasBlocked = store.ids.has(userId);
      const previous = queryClient.getQueryData<BlocksData>(moderationKeys.blocks);
      store.remove(userId);
      queryClient.setQueryData<BlocksData>(moderationKeys.blocks, withoutUser(previous, userId));
      return { wasBlocked, previous };
    },
    onError: (_error, userId, context) => {
      if (context?.wasBlocked) useBlockedUsersStore.getState().add(userId);
      if (context?.previous) queryClient.setQueryData(moderationKeys.blocks, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: moderationKeys.blocks }),
  });
}
