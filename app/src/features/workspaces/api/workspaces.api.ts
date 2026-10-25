/** Đường dẫn endpoint `/workspaces*` (be.md p1-01 §4) — nối sau `appConfig.apiBaseUrl`. */
export const WORKSPACES_ENDPOINTS = {
  LIST: '/workspaces',
  CREATE: '/workspaces',
} as const;

export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}

export function workspaceOverviewPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/overview`;
}

export function workspaceMePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/me`;
}

export function workspaceArchivePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/archive`;
}

export function workspaceRestorePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/restore`;
}

export function workspaceTransferOwnerPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/transfer-owner`;
}

export function workspaceLeavePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/leave`;
}

/**
 * Danh sách thành viên NHÓM — dùng cho bộ chọn người nhận quyền ở
 * `TransferOwnerSheet` (p1-01 app.md §3). Cùng đường dẫn với `membersPath()` của
 * feature `members` (p1-02), khai ĐỘC LẬP ở đây vì luật "không import chéo
 * feature" (`feature-structure.md`) — cùng cách `channels/api/channels.api.ts`
 * đã làm cho `workspaceMembersPath`.
 */
export function workspaceMembersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}
