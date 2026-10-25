/** Đường dẫn endpoint Resource Hub — nối sau `appConfig.apiBaseUrl` (be.md p3-01 §4). */

export function workspaceFoldersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/folders`;
}

export function folderPath(folderId: string): string {
  return `/folders/${folderId}`;
}

export function folderRestorePath(folderId: string): string {
  return `${folderPath(folderId)}/restore`;
}

export function workspaceResourcesPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/resources`;
}

export function resourcePath(resourceId: string): string {
  return `/resources/${resourceId}`;
}

export function resourceRestorePath(resourceId: string): string {
  return `${resourcePath(resourceId)}/restore`;
}

export function resourceUrlPath(resourceId: string): string {
  return `${resourcePath(resourceId)}/url`;
}

export function workspaceTrashPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/trash`;
}

/** `DELETE` = xoá VĨNH VIỄN ngay một tệp trong thùng rác (OWNER/ADMIN). */
export function workspaceTrashItemPath(workspaceId: string, resourceId: string): string {
  return `${workspaceTrashPath(workspaceId)}/${resourceId}`;
}

export function workspaceStoragePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/storage`;
}

/**
 * `/workspaces/:id` trần — đọc `myRole`/`status` để quyết định nút. Khai ĐỘC
 * LẬP với `workspaces/api/workspaces.api.ts` (không import chéo feature).
 */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}
