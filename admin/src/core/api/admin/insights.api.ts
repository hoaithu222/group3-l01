/** Đường dẫn endpoint phân tích trang Tổng quan — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). */
export const insightsApi = {
  /** GET `?range=7d|30d|90d` — chuỗi theo ngày + so với kỳ trước + phân bổ (BE gộp + cache ~60s, quyền `dashboard:view`). */
  get: '/admin/overview/insights',
} as const;
