/**
 * Đường dẫn endpoint kho tài liệu của `/admin/workspaces` (p3-01 admin.md §3).
 * Chỉ SỐ LIỆU dung lượng + hạn mức — admin KHÔNG có API liệt kê tệp/thư mục, nên KHÔNG
 * thêm route nào khác ở đây.
 */
export const workspaceResourcesApi = {
  /** GET (`workspace:view`) — 404 `CFG_005` nếu cờ `project` tắt. */
  stats: (workspaceId: string) => `/admin/workspaces/${workspaceId}/resource-stats`,
  /** PUT (`system-config:update`) — body `{ bytes, reason }`, audit `resource.quota-override`. */
  quota: (workspaceId: string) => `/admin/workspaces/${workspaceId}/resource-quota`,
  /** POST (`system-config:update`) — body `{ reason }`. Thay cho DELETE có body (admin.md §3). */
  quotaReset: (workspaceId: string) => `/admin/workspaces/${workspaceId}/resource-quota/reset`,
} as const;
