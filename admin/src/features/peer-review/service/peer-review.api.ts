/**
 * Đường dẫn endpoint chấm chéo dành cho admin nền tảng (p4-05 admin.md §3). Một route ĐỌC, số liệu tổng hợp — admin KHÔNG
 * có API xem người chấm/điểm/nhận xét và không có hành động ghi (chấm chéo thuộc chủ nhóm).
 */
export const peerReviewApi = {
  /** GET `?days=30` (`workspace:view`) — 404 `CFG_005` nếu cờ `project` tắt, 404 nếu nhóm không còn. */
  stats: (workspaceId: string) => `/admin/workspaces/${workspaceId}/review-stats`,
} as const;
