/** Đường dẫn endpoint tổng quan admin — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). */
export const overviewApi = {
  /** GET — hỗ trợ `?range=` (mặc định `7d`, BE gộp + cache 60s). */
  get: '/admin/overview',
} as const;
