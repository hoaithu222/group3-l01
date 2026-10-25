import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminReportGroup,
  AdminReportListParams,
  PrivateContent,
  RemoveMessagePayload,
  RemoveMessageResult,
  ReportActionPayload,
  ReportActionResult,
  ReportDetail,
  WorkspaceOption,
} from '../types/moderation.types';
import { moderationApi } from './moderation.api';

/** Số workspace tối đa nạp cho ô lọc (BE giới hạn `limit ≤ 100`). */
const WORKSPACE_OPTION_LIMIT = 100;

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const moderationService = {
  list: async (params: AdminReportListParams): Promise<ApiResponse<AdminReportGroup[]>> =>
    (await apiClient.get<ApiResponse<AdminReportGroup[]>>(moderationApi.list, { params })).data,

  detail: async (reportId: string): Promise<ApiResponse<ReportDetail>> =>
    (await apiClient.get<ApiResponse<ReportDetail>>(moderationApi.detail(reportId))).data,

  /**
   * `skipErrorToast`: `MOD_004`/`MOD_005` (không có quyền / hết hạn) là trạng thái bình thường
   * của luồng D-06 và được hiện NGAY TRONG khối nội dung — toast thêm là trùng.
   */
  privateContent: async (reportId: string): Promise<ApiResponse<PrivateContent>> =>
    (
      await apiClient.get<ApiResponse<PrivateContent>>(moderationApi.content(reportId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  act: async ({
    reportId,
    action,
    reason,
  }: ReportActionPayload): Promise<ApiResponse<ReportActionResult>> =>
    (
      await apiClient.patch<ApiResponse<ReportActionResult>>(moderationApi.act(reportId), {
        action,
        reason,
      })
    ).data,

  removeMessage: async ({
    messageId,
    reason,
  }: RemoveMessagePayload): Promise<ApiResponse<RemoveMessageResult>> =>
    (
      await apiClient.post<ApiResponse<RemoveMessageResult>>(
        moderationApi.removeMessage(messageId),
        { reason },
      )
    ).data,

  /**
   * Số NHÓM báo cáo đang chờ (`status=OPEN`) cho chấm số ở menu — `meta.total` của một trang 1 dòng,
   * không tải cả danh sách. Lỗi im lặng (`skipErrorToast`): chấm số chỉ là gợi ý, không phải lỗi của
   * trang. `null` khi BE không trả `meta` (chưa biết ≠ 0 — không vẽ số giả).
   */
  openCount: async (): Promise<number | null> => {
    const res = await apiClient.get<ApiResponse<AdminReportGroup[]>>(moderationApi.list, {
      params: { page: 1, limit: 1, status: 'OPEN', sort: 'latest' },
      skipErrorToast: true,
    } as RequestConfig);
    return res.data.meta?.total ?? null;
  },

  /** Lỗi 403 (thiếu `workspace:view`) im lặng — ô lọc chỉ mất danh sách gợi ý, không phải lỗi của trang. */
  workspaceOptions: async (): Promise<WorkspaceOption[]> => {
    const res = await apiClient.get<ApiResponse<WorkspaceOption[]>>(moderationApi.workspaces, {
      params: { limit: WORKSPACE_OPTION_LIMIT, sort: 'name' },
      skipErrorToast: true,
    } as RequestConfig);
    return res.data.data.map(({ id, name }) => ({ id, name }));
  },
};
