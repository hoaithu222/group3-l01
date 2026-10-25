export const templateKeys = {
  all: ['workspace-templates'] as const,
  list: () => [...templateKeys.all, 'list'] as const,
  /** Tên kênh hiện có của MỘT nhóm — để báo trước kênh sẽ bị bỏ qua (BE mới là chuẩn). */
  channelNames: (workspaceId: string) =>
    [...templateKeys.all, 'channel-names', workspaceId] as const,
};

/**
 * Khoá cache CHUNG với `useWorkspace()` của feature `workspaces` (`['workspaces','detail',wsId]`): cùng URL, cùng phản hồi
 * thật (`WorkspaceDetail` đầy đủ) — chỉ khai kiểu HẸP hơn ở đây cho phần này đọc tới (vai trò, trạng thái). Không import
 * `workspaces`; cùng cách `workspace-search`.
 */
export function workspaceDetailKey(workspaceId: string) {
  return ['workspaces', 'detail', workspaceId] as const;
}
