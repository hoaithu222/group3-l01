import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import type { DocumentsFilter } from '../api/docs.types';
import { docsKeys } from './docs.keys';

const LIST_STALE_MS = 30_000;

/** Danh sách theo nhóm (cursor) — tìm/lọc chạy ở SERVER (`q`, `status`), nên cả hai nằm trong khoá. */
export function useDocuments(wsId: string, filter: DocumentsFilter) {
  return useInfiniteQuery({
    enabled: Boolean(wsId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      docsService.list(wsId, filter, pageParam),
    queryKey: docsKeys.list(wsId, filter),
    staleTime: LIST_STALE_MS,
  });
}

/** Metadata + `myPermissions` (KHÔNG có nội dung — nội dung nằm trong Y.Doc của WebView, không qua React Query). */
export function useDocument(docId: string) {
  return useQuery({
    enabled: Boolean(docId),
    queryFn: () => docsService.detail(docId),
    queryKey: docsKeys.detail(docId),
    retry: false,
  });
}

/** Mình có tạo được tài liệu ở nhóm này không (không phải khách, nhóm đang hoạt động) — chỉ để ẩn nút; BE chặn thật. */
export function useWorkspaceDocsAccess(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryFn: () => docsService.workspaceAccess(wsId),
    queryKey: docsKeys.access(wsId),
    staleTime: 5 * 60_000,
  });
}

export function useCollaborators(docId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(docId),
    queryFn: () => docsCollabService.collaborators(docId),
    queryKey: docsKeys.collaborators(docId),
    retry: false,
  });
}

/** Thành viên nhóm để mời — chỉ tải khi tấm chọn người mở. */
export function useMemberOptions(wsId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => docsService.memberOptions(wsId),
    queryKey: docsKeys.members(wsId),
  });
}

export function useSnapshots(docId: string) {
  return useInfiniteQuery({
    enabled: Boolean(docId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      docsCollabService.snapshots(docId, pageParam),
    queryKey: docsKeys.snapshots(docId),
  });
}

/** Một bản lưu kèm `yjsState` base64 (nặng) — chỉ tải khi người dùng chạm "Xem", không lưu lâu (`gcTime` ngắn). */
export function useSnapshotDetail(docId: string, snapshotId: string | null) {
  return useQuery({
    enabled: Boolean(docId) && Boolean(snapshotId),
    gcTime: 60_000,
    queryFn: () => docsCollabService.snapshot(docId, snapshotId as string),
    queryKey: docsKeys.snapshot(docId, snapshotId ?? ''),
    retry: false,
  });
}
