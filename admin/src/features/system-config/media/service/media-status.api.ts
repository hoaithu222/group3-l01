/**
 * Đường dẫn endpoint tab "Media" — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 * Khớp `be/src/modules/media-admin/media-admin.routes.ts` (quyền `system-config:view`).
 */
export const mediaStatusApi = {
  /** GET — sức khoẻ máy chủ media, số phòng/người, egress, webhook gần nhất. Chỉ đọc. */
  status: '/admin/media/status',
} as const;
