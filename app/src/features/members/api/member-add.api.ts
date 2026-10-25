/**
 * Đường dẫn tra người theo email/SĐT (be `members.routes.ts`, OWNER/ADMIN). `POST /workspaces/:id/members` (thêm thẳng)
 * dùng lại `membersPath` của `members.api.ts`.
 */
export function memberLookupPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/member-lookup`;
}
