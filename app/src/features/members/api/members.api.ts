/** Đường dẫn endpoint `/workspaces/:id/members*` (be.md p1-02 §4). */
export function membersPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/members`;
}

export function memberPath(workspaceId: string, userId: string): string {
  return `${membersPath(workspaceId)}/${userId}`;
}

export function memberRemovePath(workspaceId: string, userId: string): string {
  return `${memberPath(workspaceId, userId)}/remove`;
}

export function memberBanPath(workspaceId: string, userId: string): string {
  return `${memberPath(workspaceId, userId)}/ban`;
}

export function memberUnbanPath(workspaceId: string, userId: string): string {
  return `${memberPath(workspaceId, userId)}/unban`;
}

/** Huy hiệu kỹ năng xác thực của một người (p6-06, `be/src/modules/career`) — gọi THẲNG, không import `features/career`. */
export function memberSkillsPath(userId: string): string {
  return `/users/${encodeURIComponent(userId)}/skills`;
}

/** Chỉ báo sức khoẻ học tập của nhóm (p7-03 P1, `be/src/modules/burnout`) — gọi THẲNG, không import `features/wellbeing` (endpoint cấp nhóm, không phải dữ liệu cá nhân của module đó). */
export function workspaceWellbeingIndicatorsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/wellbeing/indicators`;
}
