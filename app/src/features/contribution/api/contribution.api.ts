/** Đường dẫn endpoint của p4-06 (be.md §4) — nối sau `appConfig.apiBaseUrl`. */

/** `GET /boards/:id` trần — chỉ đọc tên bảng, `archivedAt`, `myPermissions` (khai ĐỘC LẬP với `features/boards`). */
export function boardPath(boardId: string): string {
  return `/boards/${boardId}`;
}

export function reportPath(boardId: string): string {
  return `/boards/${boardId}/contribution`;
}

export function periodsPath(boardId: string): string {
  return `/boards/${boardId}/contribution/periods`;
}

export function memberTasksPath(boardId: string, userId: string): string {
  return `/boards/${boardId}/contribution/members/${userId}/tasks`;
}

export function configPath(boardId: string): string {
  return `/boards/${boardId}/contribution-config`;
}

export function heatmapPath(boardId: string): string {
  return `/boards/${boardId}/heatmap`;
}

export function createExportPath(boardId: string): string {
  return `/boards/${boardId}/contribution/export`;
}

export function exportPath(exportId: string): string {
  return `/contribution-exports/${exportId}`;
}

/** `GET /workspaces/:id/activity-heatmap` — hoạt động theo NGÀY gộp MỌI bảng của nhóm (cùng dạng `/boards/:id/heatmap`). */
export function workspaceHeatmapPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/activity-heatmap`;
}

/** `GET /workspaces/:id` trần — chỉ đọc `effectiveTimezone` (khai ĐỘC LẬP với `features/boards`/`workspaces`, không import chéo). */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}

/** Thành viên ACTIVE của nhóm — nguồn của bộ chọn "xem hoạt động của" ở heatmap cấp nhóm. */
export function workspaceMembersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}
