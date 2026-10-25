/**
 * Đường dẫn endpoint của "Mẫu nhóm" (be.md p5-04 §4) — nối sau `appConfig.apiBaseUrl`. Các đường dẫn còn lại (kênh, chi
 * tiết nhóm) là của feature khác nhưng gọi THẲNG ở đây, không import chéo feature (`docs/rules/feature-structure.md`).
 */

/** `GET /workspace-templates` — mẫu đang bật kèm danh sách kênh. */
export const WORKSPACE_TEMPLATES_PATH = '/workspace-templates';

/** `POST /workspaces/:id/templates/:code/apply` — áp mẫu cho nhóm đã có (OWNER/ADMIN, `Idempotency-Key` bắt buộc). */
export function applyTemplatePath(workspaceId: string, code: string): string {
  return `/workspaces/${workspaceId}/templates/${code}/apply`;
}

/** `GET /workspaces/:id/channels` — nguồn tên kênh hiện có để báo trước kênh sẽ bị bỏ qua vì trùng tên. */
export function workspaceChannelsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/channels`;
}

/** `GET /workspaces/:id` — chỉ để đọc vai trò của mình + trạng thái nhóm (`myRole`, `status`). */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}
