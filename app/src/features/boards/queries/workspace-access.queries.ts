import { useQuery } from '@tanstack/react-query';

import { boardsService } from '../api';
import { boardKeys } from './boards.keys';

/**
 * Vai trò của tôi + trạng thái của NHÓM — quyết định nút "Tạo bảng" (OWNER/ADMIN)
 * và chế độ chỉ-đọc khi nhóm đã lưu trữ.
 *
 * ⚠️ Khoá cache CỐ Ý trùng `['workspaces','detail',wsId]` — chính khoá mà
 * `workspaces/queries/workspaces.keys.ts#detail()` dùng — để hai bên chia sẻ MỘT
 * response THẬT (`GET /workspaces/:id`), cùng kỹ thuật `useCanCreateChannel`.
 * Ghi tay thay vì import vì luật "không import chéo feature".
 */
export function useWorkspaceBoardAccess(workspaceId: string) {
  return useQuery({
    queryKey: ['workspaces', 'detail', workspaceId],
    queryFn: () => boardsService.workspaceAccess(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

/** Thành viên nhóm cho bộ chọn "Người làm" — chỉ tải khi sheet mở (`enabled`). */
export function useWorkspaceMemberOptions(workspaceId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: boardKeys.members(workspaceId, q),
    queryFn: () => boardsService.searchWorkspaceMembers(workspaceId, q),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
  });
}
