import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import type { AuditLogFilters, AuditLogPage } from '../types/audit-log.types';
import { auditLogService } from './audit-log.service';

/** Số dòng mỗi lượt tải mặc định — khớp `limit` mặc định của BE. */
export const AUDIT_LOG_PAGE_SIZE = 20;

export const auditLogKeys = {
  all: ['audit-log'] as const,
  list: (filters: AuditLogFilters) => [...auditLogKeys.all, 'list', filters] as const,
  /**
   * `limit` nằm trong key để hai panel cùng đối tượng nhưng khác cỡ trang không lẫn cache; `workspaceId`
   * và `actions` (lọc theo mã hành động) cũng vậy — cùng đối tượng nhưng lọc khác là hai danh sách khác.
   */
  byTarget: (
    targetType: string | undefined,
    targetId: string | undefined,
    limit?: number,
    workspaceId?: string,
    actions?: readonly string[],
  ) => [...auditLogKeys.all, 'target', targetType, targetId, limit, workspaceId, actions] as const,
};

/** Trang kế tiếp = `meta.nextCursor` khi còn (`hasMore`); hết thì `undefined` để React Query dừng. */
const getNextPageParam = (last: AuditLogPage): string | undefined =>
  last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined;

/** Trang audit-log toàn hệ thống — `useInfiniteQuery`, nối trang bằng "Tải thêm". */
export const useAuditLogList = (
  filters: AuditLogFilters,
  options: { limit?: number; enabled?: boolean } = {},
) => {
  const { limit = AUDIT_LOG_PAGE_SIZE, enabled = true } = options;
  return useInfiniteQuery({
    queryKey: auditLogKeys.list(filters),
    queryFn: ({ pageParam }) => auditLogService.list({ ...filters, limit, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam,
    // Đổi bộ lọc không nháy trắng bảng: giữ dòng cũ tới khi lọc mới về.
    placeholderData: keepPreviousData,
    enabled,
  });
};

/**
 * Nhật ký của MỘT đối tượng (drawer user/workspace…) — cùng service + cùng cách nối trang. `actions`
 * thu hẹp về vài mã hành động (BE lọc `IN`); `workspaceId` gom mọi bản ghi của một workspace bất kể
 * `targetType` (thành viên/lời mời/khách…). `targetType`/`targetId` bỏ trống = không lọc theo đối tượng.
 */
export const useAuditLogByTarget = (
  targetType: string | undefined,
  targetId: string | undefined,
  options: {
    limit?: number;
    enabled?: boolean;
    workspaceId?: string;
    actions?: readonly string[];
  } = {},
) => {
  const { limit = AUDIT_LOG_PAGE_SIZE, enabled = true, workspaceId, actions } = options;
  return useInfiniteQuery({
    queryKey: auditLogKeys.byTarget(targetType, targetId, limit, workspaceId, actions),
    queryFn: ({ pageParam }) =>
      auditLogService.list({
        targetType,
        targetId,
        workspaceId,
        action: actions ? [...actions] : undefined,
        limit,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam,
    enabled,
  });
};
