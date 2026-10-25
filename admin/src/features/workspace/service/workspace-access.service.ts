import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AccessSummaryView,
  AdminInvitationRow,
  AdminListInvitationsParams,
} from '../types/workspace-access.types';
import { workspaceAccessApi } from './workspace-access.api';

/**
 * Cả hai khối tự vẽ trạng thái lỗi ngay trong khung — để interceptor toast thêm là hai thông báo cho
 * một lỗi (và toast trên trang tổng quan chỉ vì thiếu số phụ là ồn).
 */
const QUIET = { skipErrorToast: true } as RequestConfig;

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceAccessService = {
  summary: async (workspaceId: string): Promise<ApiResponse<AccessSummaryView>> =>
    (
      await apiClient.get<ApiResponse<AccessSummaryView>>(
        workspaceAccessApi.summary(workspaceId),
        QUIET,
      )
    ).data,

  invitations: async (
    workspaceId: string,
    params: AdminListInvitationsParams,
  ): Promise<ApiResponse<AdminInvitationRow[]>> =>
    (
      await apiClient.get<ApiResponse<AdminInvitationRow[]>>(
        workspaceAccessApi.invitations(workspaceId),
        { ...QUIET, params },
      )
    ).data,
};
