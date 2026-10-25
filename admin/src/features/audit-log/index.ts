/**
 * Public API của feature `audit-log` — CHỈ phần nhẹ (service + kiểu), KHÔNG re-export
 * trang/component để nơi khác (vd `shared/widgets/audit-trail`) import không kéo cả trang vào
 * bundle. Trang được nạp lười qua `audit-log.routes.tsx`.
 */
export { auditLogKeys, useAuditLogByTarget, useAuditLogList } from './service/audit-log.queries';
export type {
  AuditActorDto,
  AuditLogDto,
  AuditLogFilters,
  AuditLogPage,
} from './types/audit-log.types';
