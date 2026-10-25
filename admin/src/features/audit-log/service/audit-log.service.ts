import { apiClient } from '@/core/api/client';

import type { AuditLogListParams, AuditLogPage } from '../types/audit-log.types';
import { auditLogApi } from './audit-log.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. Chỉ ĐỌC. */
export const auditLogService = {
  /** Thân phản hồi BE: `{ success, data: AuditLogDto[], meta: { nextCursor, hasMore, limit } }`. */
  list: async ({ action, ...rest }: AuditLogListParams): Promise<AuditLogPage> => {
    const res = await apiClient.get<AuditLogPage>(auditLogApi.list, {
      params: {
        ...rest,
        // BE nhận nhiều mã ngăn bằng dấu phẩy (KHÔNG phải key lặp).
        action: action && action.length > 0 ? action.join(',') : undefined,
      },
    });
    return { data: res.data.data, meta: res.data.meta };
  },
};
