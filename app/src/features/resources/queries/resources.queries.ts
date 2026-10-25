import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToastStore } from '@/shared/ui/feedback/toast-store';

import {
  MIN_SEARCH_LENGTH,
  resourcesService,
  type ResourceDto,
  type ResourceListParams,
  type UpdateResourcePayload,
} from '../api';
import { RESOURCE_PAGE_SIZE } from '../constants/resource-limits.constants';
import {
  invalidateWorkspaceResources,
  removeResourceFromLists,
  replaceResourceInLists,
  restoreListSnapshot,
} from './resource-cache';
import { resourceKeys } from './resources.keys';

/**
 * Danh sách tệp phân trang cursor (30/trang). `q` (đã trim, ≥ 2 ký tự) ⇒ tìm
 * toàn workspace — khoá đổi sang `search` để không lẫn cache với duyệt thư mục.
 * `q` ngắn hơn ngưỡng bị coi như không có (ô tìm chưa đủ ký tự thì vẫn xem thư mục).
 */
export function useResourcesInfinite(wsId: string, params: ResourceListParams, enabled = true) {
  const q = params.q?.trim();
  const searching = Boolean(q && q.length >= MIN_SEARCH_LENGTH);
  const effective: ResourceListParams = searching
    ? { ...params, q, folderId: undefined }
    : { ...params, q: undefined };

  return useInfiniteQuery({
    queryKey: searching
      ? resourceKeys.search(wsId, q as string, params.type, params.sort, params.order)
      : resourceKeys.list(wsId, effective),
    queryFn: ({ pageParam }) =>
      resourcesService.list(wsId, effective, pageParam, RESOURCE_PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: enabled && Boolean(wsId),
    staleTime: 30_000,
  });
}

export function useResource(resourceId: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.detail(resourceId ?? ''),
    queryFn: () => resourcesService.get(resourceId as string),
    enabled: Boolean(resourceId),
    staleTime: 30_000,
  });
}

/** Đổi tên / di chuyển / sửa mô tả — `expectedVersion` bắt buộc; 409 `RES_003` do sheet xử lý (giữ sheet, refetch). */
export function useUpdateResource(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, payload }: { payload: UpdateResourcePayload; resourceId: string }) =>
      resourcesService.update(resourceId, payload),
    onSuccess: (updated, variables) => {
      if (variables.payload.folderId !== undefined) {
        invalidateWorkspaceResources(queryClient, wsId);
        // Tiền tố theo `wsId` ở trên KHÔNG khớp `['resources','detail',id]` — màn xem trước vẫn hiện thư mục cũ nếu không ghi.
        queryClient.setQueryData(resourceKeys.detail(updated.id), updated);
      } else {
        replaceResourceInLists(queryClient, wsId, updated);
      }
    },
  });
}

/**
 * Xoá mềm: gỡ NGAY khỏi mọi danh sách (optimistic), lỗi thì trả lại đúng chỗ.
 * Thành công ⇒ toast "Đã chuyển vào thùng rác · Hoàn tác" (app.md §4); Hoàn tác
 * gọi `restore` rồi làm cũ danh sách.
 */
export function useDeleteResource(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resource: Pick<ResourceDto, 'id' | 'name'>) =>
      resourcesService.remove(resource.id),
    onMutate: async (resource) => {
      // Huỷ cả lượt TÌM đang bay: kết quả cũ của nó về sau sẽ chèn lại tệp vừa gỡ khỏi danh sách tìm.
      await queryClient.cancelQueries({ queryKey: ['resources', 'list', wsId] });
      await queryClient.cancelQueries({ queryKey: ['resources', 'search', wsId] });
      return { snapshot: removeResourceFromLists(queryClient, wsId, resource.id) };
    },
    onError: (_error, _resource, context) => {
      if (context) restoreListSnapshot(queryClient, context.snapshot);
    },
    onSuccess: (_data, resource) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.storage(wsId) });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.trash(wsId) });
      useToastStore.getState().show('success', `Đã chuyển "${resource.name}" vào thùng rác`, {
        action: {
          label: 'Hoàn tác',
          onPress: () => {
            void resourcesService
              .restore(resource.id)
              .then(() => invalidateWorkspaceResources(queryClient, wsId))
              // Hoàn tác thất bại (mất mạng…) — lỗi đã toast tại `apiClient`; không để Promise reject vô chủ
              // (bản dev hiện thanh LogBox "Uncaught (in promise)" ở đáy màn).
              .catch(() => undefined);
          },
        },
        dismissible: true,
      });
    },
  });
}
