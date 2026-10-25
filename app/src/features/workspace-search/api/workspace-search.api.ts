/**
 * Đường dẫn endpoint của "Tìm toàn workspace" (be.md p5-04 §4) — nối sau `appConfig.apiBaseUrl`.
 * Các đường dẫn còn lại (thành viên, kênh, hội thoại) là của feature khác nhưng gọi THẲNG ở đây, không import chéo
 * feature (`docs/rules/feature-structure.md`) — cùng mẫu `discovery.api.ts`.
 */
export function workspaceSearchPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/search`;
}

/** `GET /workspaces/:id/members` — nguồn bộ lọc "Người gửi" (khách không có quyền gọi, nên ẩn bộ lọc đó). */
export function workspaceMembersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}

/** `GET /workspaces/:id/channels` — nguồn bộ lọc "Phạm vi" (kênh đã tham gia + kênh công khai khám phá được). */
export function workspaceChannelsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/channels`;
}

/** `GET /conversations?filter=group&workspaceId=` — nhóm chat của nhóm này (nguồn bộ lọc "Phạm vi"). */
export const CONVERSATIONS_PATH = '/conversations';

/** `POST /channels/:id/join` — tham gia kênh CÔNG KHAI từ kết quả tìm loại Kênh (endpoint của `channels`, gọi thẳng). */
export function channelJoinPath(channelId: string): string {
  return `/channels/${channelId}/join`;
}

/** `GET /workspaces/:id` — chỉ để đọc vai trò của mình (`myRole`): khách không có tab "Người". */
export function workspacePath(workspaceId: string): string {
  return `/workspaces/${workspaceId}`;
}
