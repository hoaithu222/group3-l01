/** Đường dẫn endpoint của p3-02 (be.md §4) — nối sau `appConfig.apiBaseUrl`. */

export function workspaceBoardsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/boards`;
}

export function boardPath(boardId: string): string {
  return `/boards/${boardId}`;
}

/** p3-02 P1: mẫu bảng dựng sẵn (dữ liệu tĩnh, chỉ cần đăng nhập). */
export function boardTemplatesPath(): string {
  return '/board-templates';
}

/** p3-02 P1: `POST` tạo bảng từ mẫu (OWNER/ADMIN của nhóm). */
export function workspaceBoardFromTemplatePath(workspaceId: string): string {
  return `${workspaceBoardsPath(workspaceId)}/from-template`;
}

/** p3-02 P1: `POST` sao chép bảng (OWNER/ADMIN của nhóm). */
export function boardDuplicatePath(boardId: string): string {
  return `${boardPath(boardId)}/duplicate`;
}

export function boardArchivePath(boardId: string): string {
  return `${boardPath(boardId)}/archive`;
}

export function boardRestorePath(boardId: string): string {
  return `${boardPath(boardId)}/restore`;
}

export function boardColumnsPath(boardId: string): string {
  return `${boardPath(boardId)}/columns`;
}

export function boardTasksPath(boardId: string): string {
  return `${boardPath(boardId)}/tasks`;
}

export function boardLabelsPath(boardId: string): string {
  return `${boardPath(boardId)}/labels`;
}

export function taskMovePath(taskId: string): string {
  return `/tasks/${taskId}/move`;
}

export function labelPath(labelId: string): string {
  return `/labels/${labelId}`;
}

/**
 * `GET /workspaces/:id` trần — đọc `myRole`/`status` của nhóm. Khai ĐỘC LẬP với
 * `workspaces/api` (không import chéo feature, `feature-structure.md`).
 */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}

/** Danh sách thành viên nhóm — cho bộ chọn "Người làm" của bộ lọc. */
export function workspaceMembersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}
