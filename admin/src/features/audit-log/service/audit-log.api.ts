/**
 * Đường dẫn endpoint nhật ký — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`).
 * Khớp `be/src/modules/audit-log/audit-log.routes.ts` (quyền `audit-log:view`).
 */
export const auditLogApi = {
  /** GET — danh sách cursor, mới nhất trước. */
  list: '/audit-logs',
} as const;
