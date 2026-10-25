/** Đường dẫn endpoint `/workspaces/:id/channels*` · `/channels/:id*` (be.md p1-03 §4). */
export function workspaceChannelsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/channels`;
}

export function workspaceChannelsSearchPath(workspaceId: string): string {
  return `${workspaceChannelsPath(workspaceId)}/search`;
}

/**
 * Danh sách thành viên NHÓM (không phải kênh) — dùng lại bởi bước "Đối tượng"
 * của wizard tạo kênh và `AddGrantSheet` để chọn người. Cùng đường dẫn với
 * `membersPath()` của feature `members` (p1-02), khai ĐỘC LẬP ở đây vì luật
 * "không import chéo feature" (`feature-structure.md`) — hai nơi cùng gọi một
 * endpoint BE, không cùng import một hằng số.
 */
export function workspaceMembersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}

/**
 * `/workspaces/:id` trần — dùng lại bởi `useCanCreateChannel` để đọc
 * `myPermissions.canCreateChannel` (be.md p1-01 §4). Khai ĐỘC LẬP với
 * `workspaces/api/workspaces.api.ts` (không import chéo feature).
 */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}

export function channelPath(channelId: string): string {
  return `/channels/${channelId}`;
}

export function channelArchivePath(channelId: string): string {
  return `${channelPath(channelId)}/archive`;
}

export function channelRestorePath(channelId: string): string {
  return `${channelPath(channelId)}/restore`;
}

export function channelJoinPath(channelId: string): string {
  return `${channelPath(channelId)}/join`;
}

export function channelLeavePath(channelId: string): string {
  return `${channelPath(channelId)}/leave`;
}

export function channelMePath(channelId: string): string {
  return `${channelPath(channelId)}/me`;
}

export function channelMembersPath(channelId: string): string {
  return `${channelPath(channelId)}/members`;
}

export function channelGrantsPath(channelId: string): string {
  return `${channelPath(channelId)}/grants`;
}

export function channelGrantPath(channelId: string, userId: string): string {
  return `${channelGrantsPath(channelId)}/${userId}`;
}

/** `POST /channels/:id/grants/roles` (cấp cả vai trò) — be.md p3-04 §4. */
export function channelRoleGrantsPath(channelId: string): string {
  return `${channelGrantsPath(channelId)}/roles`;
}

export function channelRoleGrantPath(channelId: string, roleRef: string): string {
  return `${channelRoleGrantsPath(channelId)}/${roleRef}`;
}

/** `GET /channels/:id/members/:userId/access` — nguồn quyền hiệu lực (PR-05). */
export function channelMemberAccessPath(channelId: string, userId: string): string {
  return `${channelMembersPath(channelId)}/${userId}/access`;
}
