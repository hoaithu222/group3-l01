/**
 * Đường dẫn endpoint dự án của `/admin/workspaces` (p3-02 admin.md §3, p4-06 admin.md §3). Hai route ĐỌC, số liệu
 * tổng hợp — admin KHÔNG có API xem thẻ/tiêu đề thẻ hay điểm đóng góp và không có hành động ghi (bảng thuộc chủ nhóm).
 */
export const workspaceProjectsApi = {
  /** GET (`workspace:view`) — 404 `CFG_005` nếu cờ `project` tắt. */
  stats: (workspaceId: string) => `/admin/workspaces/${workspaceId}/project-stats`,
  /** GET `?days=30` (`workspace:view`) — chỉ số đếm sức khoẻ báo cáo đóng góp; 404 `CFG_005` nếu cờ `project` tắt. */
  contributionStats: (workspaceId: string) => `/admin/workspaces/${workspaceId}/contribution-stats`,
} as const;
