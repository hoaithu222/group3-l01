/**
 * Đường dẫn endpoint quyền truy cập của `/admin/workspaces` (p3-04 admin.md §3). Chỉ ĐỌC — admin không
 * có route mời/duyệt; thu hồi thành viên dùng lại `workspaceMembersApi.revoke` (p1-02).
 */
export const workspaceAccessApi = {
  /** GET (`workspace:view`) — chính sách tham gia/khách + số đếm chờ duyệt, khách sắp hết hạn, kênh riêng. */
  summary: (workspaceId: string) => `/admin/workspaces/${workspaceId}/access-summary`,
  /** GET (`workspace:view`) — lời mời email, email che ở server, không token. */
  invitations: (workspaceId: string) => `/admin/workspaces/${workspaceId}/invitations`,
} as const;
