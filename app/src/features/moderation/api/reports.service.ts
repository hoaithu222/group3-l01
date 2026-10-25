import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { REPORTS_API } from './reports.api';
import type {
  CreateReportPayload,
  CreateReportResult,
  CursorMeta,
  MyReportItem,
  QueueScope,
  ReportStatus,
  ResolveReportPayload,
  ResolveReportResult,
  ScopeReportDetail,
  ScopeReportItem,
} from './moderation.types';

export interface CursorPage<T> {
  data: T[];
  meta: CursorMeta;
}

interface CursorBody<T> {
  data: T[];
  meta: CursorMeta;
}

/**
 * Gọi thẳng `apiClient` theo hợp đồng BE p1-08 (`reports.routes.ts` · `scope-reports.routes.ts`).
 *
 * ⛔ Danh sách phân trang KHÔNG dùng `unwrapData`: BE trả `{ success, data: [...], meta }` ngay
 * ở gốc thân phản hồi, `unwrapData` bóc `.data` và VỨT `meta` — `getNextPageParam` sau đó đọc
 * `last.meta.hasMore` trên một mảng trần và nổ. Đọc thẳng `response.data` (cùng `chat.service.list`).
 *
 * `skipErrorToast` ở mọi lời gọi: lỗi thuộc về FORM/MÀN (mã `MOD_*`, 403 không có phạm vi kiểm
 * duyệt) hiện ĐÚNG CHỖ, không phải toast tự tắt sau vài giây.
 */
export const reportsService = {
  async create(payload: CreateReportPayload): Promise<CreateReportResult> {
    const response = await apiClient.post<CreateReportResult>(REPORTS_API.create, payload, { skipErrorToast: true });
    return unwrapData<CreateReportResult>(response);
  },

  async mine(cursor?: string, limit?: number): Promise<CursorPage<MyReportItem>> {
    const response = await apiClient.get<CursorBody<MyReportItem>>(REPORTS_API.mine, {
      params: { cursor, limit },
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  /** Hàng đợi báo cáo theo phạm vi kiểm duyệt của TÔI — `WORKSPACE` gộp mọi phạm vi tôi kiểm duyệt trong nhóm. */
  async queue(
    scope: QueueScope,
    params: { status: ReportStatus; cursor?: string; limit?: number },
  ): Promise<CursorPage<ScopeReportItem>> {
    const url =
      scope.type === 'WORKSPACE' ? REPORTS_API.workspaceQueue(scope.id) : REPORTS_API.conversationQueue(scope.id);
    const response = await apiClient.get<CursorBody<ScopeReportItem>>(url, { params, skipErrorToast: true });
    return { data: response.data.data, meta: response.data.meta };
  },

  async detail(reportId: string): Promise<ScopeReportDetail> {
    const response = await apiClient.get<ScopeReportDetail>(REPORTS_API.detail(reportId), { skipErrorToast: true });
    return unwrapData<ScopeReportDetail>(response);
  },

  async resolve(reportId: string, payload: ResolveReportPayload): Promise<ResolveReportResult> {
    const response = await apiClient.post<ResolveReportResult>(REPORTS_API.resolve(reportId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ResolveReportResult>(response);
  },
};
