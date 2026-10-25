/**
 * Đường dẫn endpoint ví nhóm của `/admin/workspaces` (p6-04 admin.md §2.1/§3).
 * Chỉ MỘT route đọc, thống kê tổng hợp ẩn danh — admin KHÔNG có API khoản chi, số
 * dư, settlement hay tài khoản ngân hàng, nên KHÔNG thêm route nào khác ở đây.
 */
export const workspaceWalletApi = {
  /** GET (`workspace:view`) — 404 nếu workspace không tồn tại; 404 `CFG_005` nếu cờ `wallet` tắt. */
  stats: (workspaceId: string) => `/admin/workspaces/${workspaceId}/wallet-stats`,
} as const;
