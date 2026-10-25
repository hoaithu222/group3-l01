/**
 * Dữ liệu + handler MSW dùng chung cho test nhật ký (trang audit-log và `AuditTrailPanel`).
 *
 * Đúng HÌNH DẠNG BE thật (`be/src/modules/audit-log`): thời gian là `at` (không phải
 * `createdAt`), người thực hiện là `actor { id, name, role } | null`, phân trang cursor
 * `meta { nextCursor, hasMore, limit }`.
 */
import { http, HttpResponse } from 'msw';

import type { AuditLogDto } from '@/features/audit-log';

export const OID_ACTOR = '665f1c2e8a1b2c3d4e5f6a7b';
export const OID_OTHER = '665f1c2e8a1b2c3d4e5f6a7c';
export const OID_WORKSPACE = '665f1c2e8a1b2c3d4e5f6a7d';

export function makeLog(overrides: Partial<AuditLogDto> & { id: string }): AuditLogDto {
  return {
    actorId: OID_ACTOR,
    actor: { id: OID_ACTOR, name: 'Nguyễn Văn An', role: 'admin' },
    actorRole: 'unknown',
    action: 'user.lock',
    targetType: 'User',
    targetId: OID_OTHER,
    workspaceId: null,
    reason: 'Vi phạm điều khoản sử dụng',
    metadata: null,
    ip: null,
    userAgent: null,
    at: '2026-09-18T03:04:05.000Z',
    ...overrides,
  };
}

/** Ghi lại mọi request `GET /audit-logs` để test khẳng định tham số gửi lên. */
export interface AuditLogRequestLog {
  params: URLSearchParams[];
}

/**
 * Handler `GET * /audit-logs` phân trang cursor theo mảng `pages`: request không có
 * `cursor` → trang 0; `cursor=page-N` → trang N. Trang i (không phải cuối) trả
 * `hasMore: true, nextCursor: 'page-{i+1}'`.
 */
export function auditLogHandler(pages: AuditLogDto[][], log?: AuditLogRequestLog) {
  return http.get('*/audit-logs', ({ request }) => {
    const params = new URL(request.url).searchParams;
    log?.params.push(params);
    const cursor = params.get('cursor');
    const index = cursor ? Number(cursor.replace('page-', '')) : 0;
    const data = pages[index] ?? [];
    const hasMore = index < pages.length - 1;
    return HttpResponse.json({
      success: true,
      data,
      meta: { nextCursor: hasMore ? `page-${index + 1}` : null, hasMore, limit: 20 },
    });
  });
}
