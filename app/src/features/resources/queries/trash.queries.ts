import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { resourcesService } from '../api';
import { invalidateWorkspaceResources } from './resource-cache';
import { resourceKeys } from './resources.keys';

/**
 * Thùng rác (≤ 30 ngày). MEMBER thấy của mình, OWNER/ADMIN thấy tất cả — BE lọc.
 * `meta.nextCursor` có thì phân trang, không thì một trang.
 */
export function useTrash(wsId: string) {
  return useInfiniteQuery({
    queryKey: resourceKeys.trash(wsId),
    queryFn: ({ pageParam }) => resourcesService.trash(wsId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta?.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(wsId),
    staleTime: 15_000,
  });
}

/** Khôi phục tệp: thư mục cha đã xoá ⇒ BE khôi phục về GỐC (không lỗi — be.md §4). */
export function useRestoreResource(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => resourcesService.restore(resourceId),
    onSuccess: (_result, resourceId) => {
      invalidateWorkspaceResources(queryClient, wsId);
      // Chi tiết không mang `wsId` ở vị trí [2] nên tiền tố trên không chạm — khôi phục về GỐC là đổi thư mục.
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(resourceId) });
    },
  });
}

/** Xoá vĩnh viễn ngay — chỉ OWNER/ADMIN; giải phóng dung lượng nên làm cũ `storage`. */
export function usePurgeResource(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => resourcesService.purge(wsId, resourceId),
    onSuccess: (_result, resourceId) => {
      invalidateWorkspaceResources(queryClient, wsId);
      queryClient.removeQueries({ queryKey: resourceKeys.detail(resourceId) });
    },
  });
}
