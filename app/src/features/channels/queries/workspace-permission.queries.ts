import { useQuery } from '@tanstack/react-query';

import { channelsService } from '../api';

/**
 * `myPermissions.canCreateChannel` của workspace — `ChannelListScreen` (app.md
 * §3: nút "Tạo kênh" theo `myPermissions.canCreateChannel` của workspace).
 *
 * ⚠️ Khoá cache CỐ Ý trùng `['workspaces', 'detail', wsId]` — CHÍNH XÁC khoá
 * mà `workspaces/queries/workspaces.keys.ts#detail()` dùng. Ghi tay thay vì
 * import (`feature-structure.md`: không import chéo feature), cùng kỹ thuật
 * `invalidateWorkspaceSummary()` trong `members/queries/members.queries.ts`
 * đã dùng. An toàn vì `channelsService.workspacePermissions()` gọi ĐÚNG endpoint
 * `GET /workspaces/:id` mà `workspacesService.get()` gọi — hai bên chia sẻ MỘT
 * response THẬT (`WorkspaceDetail` đầy đủ), chỉ khác kiểu khai ở phía đọc.
 */
export function useCanCreateChannel(wsId: string): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['workspaces', 'detail', wsId],
    queryFn: () => channelsService.workspacePermissions(wsId),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
  return data?.myPermissions.canCreateChannel;
}
