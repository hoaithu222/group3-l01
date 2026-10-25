/**
 * Đường dẫn endpoint `/admin/workspaces/:workspaceId/members*` — khớp
 * `admin-members.routes.ts` phía BE (p1-02 be.md §4).
 */
export const workspaceMembersApi = {
  /** GET — danh sách thành viên, hỗ trợ `q`/`role`/`status`/`sort`/`page`/`limit`. */
  list: (workspaceId: string) => `/admin/workspaces/${workspaceId}/members`,
  /** POST — thu hồi/chặn cấp nền tảng, body `{ reason, ban }`. */
  revoke: (workspaceId: string, userId: string) =>
    `/admin/workspaces/${workspaceId}/members/${userId}/revoke`,
} as const;
