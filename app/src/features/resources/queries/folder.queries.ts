import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  foldersService,
  ROOT_FOLDER,
  type CreateFolderPayload,
  type FolderRef,
  type UpdateFolderPayload,
} from '../api';
import { invalidateWorkspaceResources } from './resource-cache';
import { resourceKeys } from './resources.keys';

/**
 * Thư mục hiện tại: breadcrumb + thư mục con (app.md §4 `staleTime` 30 s).
 * `folderId = 'root'` ⇒ gốc (không gửi `parentId`). Cũng dùng cho `MoveToFolderSheet`
 * duyệt cây từng cấp.
 */
export function useFolderQuery(wsId: string, folderId: FolderRef, enabled = true) {
  return useQuery({
    queryKey: resourceKeys.folder(wsId, folderId),
    queryFn: () => foldersService.list(wsId, folderId === ROOT_FOLDER ? undefined : folderId),
    enabled: enabled && Boolean(wsId),
    staleTime: 30_000,
  });
}

/**
 * ⚠️ KHÔNG `onError` toast: `foldersService.create/update` đã `skipErrorToast` —
 * lỗi `RSC_001/002/006` hiện tại CHỖ (dưới ô tên trong sheet, giữ nội dung).
 * Sheet đọc `mutation.error` qua `resourceErrorMessage`.
 */
export function useCreateFolder(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFolderPayload) => foldersService.create(wsId, payload),
    onSuccess: () => {
      // Thư mục mới đổi `children` của cha (và breadcrumb của chính nó): refetch
      // các thư mục đang mở thay vì chèn tay — BE mới là nơi sắp `normalizedName`.
      void queryClient.invalidateQueries({ queryKey: ['resources', 'folder', wsId] });
    },
  });
}

/** Đổi tên HOẶC di chuyển (`parentId`) — cả hai đổi breadcrumb của cả cây con nên làm cũ mọi khung thư mục. */
export function useUpdateFolder(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, payload }: { folderId: string; payload: UpdateFolderPayload }) =>
      foldersService.update(folderId, payload),
    onSuccess: () => invalidateWorkspaceResources(queryClient, wsId),
  });
}

/** `recursive` chỉ OWNER/ADMIN (BE `RSC_004` nếu MEMBER hoặc thư mục còn nội dung mà không recursive). */
export function useDeleteFolder(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, recursive }: { folderId: string; recursive: boolean }) =>
      foldersService.remove(folderId, recursive),
    onSuccess: () => invalidateWorkspaceResources(queryClient, wsId),
  });
}

export function useRestoreFolder(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => foldersService.restore(folderId),
    onSuccess: () => invalidateWorkspaceResources(queryClient, wsId),
  });
}
