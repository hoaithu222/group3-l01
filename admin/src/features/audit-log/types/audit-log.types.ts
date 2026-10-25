import type { CursorMeta } from '@/shared/types/api.types';

/**
 * Kiểu nhật ký quản trị — viết TAY theo `GET /audit-logs` của `../be`
 * (`be/src/modules/audit-log/audit-log.service.ts` → `AuditLogEntry`).
 *
 * ⚠️ Tạm thời: khi p0-09 sinh `openapi.json` + `src/core/api/generated/schema.d.ts` thì
 * thay bằng `Schemas['AuditLogDto']` và xoá file này (giữ nguyên tên export để
 * `AuditTrailPanel`/trang audit-log không phải sửa).
 */

/** Người thực hiện đã tra từ `User` (BE gắn sẵn, tra batch). */
export interface AuditActorDto {
  id: string;
  name: string;
  /** Vai trò hệ thống HIỆN TẠI (khác `actorRole` = vai lúc thao tác). */
  role: string;
}

export interface AuditLogDto {
  id: string;
  actorId: string;
  /** `null` khi user đã bị xoá cứng — UI rơi về `actorId`. */
  actor: AuditActorDto | null;
  /** Vai lúc thao tác (`"unknown"` nếu nơi ghi không truyền). */
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  reason: string | null;
  /** JSON tuỳ hành động (vd `{ from, to }`, `{ value, version }`). */
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  /** ISO-8601. Trường thời gian của BE là `at` (KHÔNG phải `createdAt`). */
  at: string;
}

/** Bộ lọc — khớp query của BE. `action` là MẢNG ở client, gộp thành `a,b` khi gửi. */
export interface AuditLogFilters {
  actorId?: string;
  action?: string[];
  targetType?: string;
  targetId?: string;
  workspaceId?: string;
  /** ISO-8601 (đầu ngày, giờ máy người xem). */
  from?: string;
  /** ISO-8601 (cuối ngày, giờ máy người xem). */
  to?: string;
}

export interface AuditLogListParams extends AuditLogFilters {
  cursor?: string;
  limit?: number;
}

export interface AuditLogPage {
  data: AuditLogDto[];
  meta: CursorMeta;
}
