import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { whiteboardCollabService } from '../api/whiteboard-collab.service';
import { whiteboardService } from '../api/whiteboard.service';
import type { WhiteboardsFilter } from '../api/whiteboard.types';
import { whiteboardKeys } from './whiteboard.keys';

const LIST_STALE_MS = 30_000;

/** Danh sách theo nhóm (cursor) — tìm/lọc chạy ở SERVER (`q`, `status`), nên cả hai nằm trong khoá. */
export function useWhiteboards(wsId: string, filter: WhiteboardsFilter) {
  return useInfiniteQuery({
    enabled: Boolean(wsId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      whiteboardService.list(wsId, filter, pageParam),
    queryKey: whiteboardKeys.list(wsId, filter),
    staleTime: LIST_STALE_MS,
  });
}

/** Metadata + `myPermissions` (KHÔNG có nội dung — nội dung nằm trong Y.Doc của phiên collab, không qua React Query). */
export function useWhiteboard(wbId: string) {
  return useQuery({
    enabled: Boolean(wbId),
    queryFn: () => whiteboardService.detail(wbId),
    queryKey: whiteboardKeys.detail(wbId),
    retry: false,
  });
}

/** Mình có tạo được bảng ở nhóm này không (không phải khách, nhóm đang hoạt động) — chỉ để ẩn nút; BE chặn thật. */
export function useWorkspaceWhiteboardAccess(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryFn: () => whiteboardService.workspaceAccess(wsId),
    queryKey: whiteboardKeys.access(wsId),
    staleTime: 5 * 60_000,
  });
}

export function useCollaborators(wbId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(wbId),
    queryFn: () => whiteboardCollabService.collaborators(wbId),
    queryKey: whiteboardKeys.collaborators(wbId),
    retry: false,
  });
}

/** Thành viên nhóm để mời — chỉ tải khi tấm chọn người mở. */
export function useMemberOptions(wsId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(wsId),
    queryFn: () => whiteboardService.memberOptions(wsId),
    queryKey: whiteboardKeys.members(wsId),
  });
}

export function useSnapshots(wbId: string) {
  return useInfiniteQuery({
    enabled: Boolean(wbId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      whiteboardCollabService.snapshots(wbId, pageParam),
    queryKey: whiteboardKeys.snapshots(wbId),
  });
}
