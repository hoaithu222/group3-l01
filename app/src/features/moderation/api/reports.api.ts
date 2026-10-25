/**
 * Đường dẫn endpoint báo cáo/kiểm duyệt (be `modules/moderation`) — `grep` một lần là thấy hết
 * mặt tiếp xúc backend. Mọi route cần `Authorization` + cờ phân hệ `communication`.
 */
export const REPORTS_API = {
  /** `POST` — báo cáo tin/người/kênh/nhóm chat (idempotent). */
  create: '/reports',
  /** `GET` — báo cáo tôi đã gửi (cursor). */
  mine: '/me/reports',
  detail: (reportId: string) => `/reports/${reportId}`,
  resolve: (reportId: string) => `/reports/${reportId}/resolve`,
  workspaceQueue: (workspaceId: string) => `/workspaces/${workspaceId}/reports`,
  conversationQueue: (conversationId: string) => `/conversations/${conversationId}/reports`,
} as const;
