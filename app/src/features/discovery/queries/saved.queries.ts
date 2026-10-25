import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';

import type { SavedListFilter } from '@/shared/saved';

import { discoveryKeys } from '../api/discovery.keys';
import { discoveryService } from '../api/discovery.service';
import type { SavedPage } from '../api/discovery.types';

const PAGE_SIZE = 30;

/** "Đã lưu" của tôi — cursor `(savedAt, id)`, mới lưu → cũ. `retry: false`: lỗi hiện luôn với nút "Thử lại", không âm thầm gọi lại. */
export function useSavedList(filter: SavedListFilter) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.saved.list(filter),
    queryFn: ({ pageParam }) =>
      discoveryService.listSaved({ ...filter, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

/** Danh sách nhóm cho chip lọc — chỉ tải khi người dùng mở tờ chọn nhóm. */
export function useDiscoveryWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: discoveryKeys.workspaces(),
    queryFn: () => discoveryService.listWorkspaces(),
    enabled,
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở tờ chọn là tải lại nền.
    staleTime: 0,
  });
}

/** Bỏ một tin khỏi mọi trang đã tải (bỏ lưu xong không phải chờ refetch) — trả lại NGUYÊN tham chiếu nếu không có tin đó. */
export function removeSavedMessage(
  data: InfiniteData<SavedPage> | undefined,
  messageId: string,
): InfiniteData<SavedPage> | undefined {
  if (!data?.pages.some((page) => page.data.some((item) => item.messageId === messageId)))
    return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.filter((item) => item.messageId !== messageId),
    })),
  };
}

export function flattenSavedIds(data: InfiniteData<SavedPage> | undefined): string[] {
  return data?.pages.flatMap((page) => page.data.map((item) => item.messageId)) ?? [];
}
