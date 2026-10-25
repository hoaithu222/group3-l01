/**
 * Đường dẫn endpoint `/admin/workspaces/:workspaceId/conversations` — khớp
 * `admin-conversations.routes.ts` phía BE (p1-05 admin.md §3). Chỉ có route
 * đọc danh sách ở đây — `POST /admin/conversations/:id/dissolve` do module
 * `moderation` sở hữu (p1-08, admin.md §2.2), KHÔNG thêm ở đây.
 */
export const workspaceConversationsApi = {
  /** GET — danh sách hội thoại NHÓM trong workspace + số liệu tổng hợp, hỗ trợ `page`/`limit`/`status`. */
  list: (workspaceId: string) => `/admin/workspaces/${workspaceId}/conversations`,
} as const;
