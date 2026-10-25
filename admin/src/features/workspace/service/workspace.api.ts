/**
 * Đường dẫn endpoint `/admin/workspaces` — khớp `admin-workspaces.routes.ts`
 * phía BE (p1-01 be.md §4).
 */
export const workspaceApi = {
  /** GET — danh bạ, hỗ trợ `q`/`status`/`ownerId`/`createdFrom`/`createdTo`/`sort`/`page`/`limit`. */
  list: '/admin/workspaces',
  /** GET — chi tiết + số liệu 30 ngày. */
  detail: (id: string) => `/admin/workspaces/${id}`,
  /** GET — chuỗi số liệu theo ngày, `?range=7d|30d|90d`. */
  stats: (id: string) => `/admin/workspaces/${id}/stats`,
  /** POST — lưu trữ cấp nền tảng, body `{ reason }`. */
  archive: (id: string) => `/admin/workspaces/${id}/archive`,
  /** POST — khôi phục, body `{ reason }`. */
  restore: (id: string) => `/admin/workspaces/${id}/restore`,
  /** POST (`workspace:update`) — gỡ ảnh đại diện/ảnh bìa vi phạm, body `{ kind: 'AVATAR' | 'COVER', reason }`. */
  removeImage: (id: string) => `/admin/workspaces/${id}/remove-image`,
  /**
   * GET (`user:view`) — chỉ để dựng ô lọc chủ sở hữu (`?q=&page=&limit=`); hợp đồng của phân hệ `user`
   * (`user.routes.ts`), cùng cách `moderation` mượn `/admin/workspaces` cho ô lọc workspace.
   */
  owners: '/users',
} as const;
