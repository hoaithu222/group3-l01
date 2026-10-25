import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  EndMentorEngagementPayload,
  WorkspaceMentorEngagement,
  WorkspaceMentorOverview,
} from '../types/workspace-mentor.types';
import { workspaceMentorApi } from './workspace-mentor.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceMentorService = {
  /** Tab tự vẽ trạng thái lỗi/cờ tắt (404 `CFG_005` là ca bình thường) — bỏ toast của interceptor để không báo hai lần. */
  overview: async (workspaceId: string): Promise<ApiResponse<WorkspaceMentorOverview>> =>
    (
      await apiClient.get<ApiResponse<WorkspaceMentorOverview>>(
        workspaceMentorApi.overview(workspaceId),
        { skipErrorToast: true } as RequestConfig,
      )
    ).data,

  /** Lỗi ghi (vd `MENTOR_009` đợt vừa kết thúc) để interceptor toast như mọi hành động quản trị khác. */
  endEngagement: async ({
    engagementId,
    reason,
  }: EndMentorEngagementPayload): Promise<ApiResponse<WorkspaceMentorEngagement>> =>
    (
      await apiClient.post<ApiResponse<WorkspaceMentorEngagement>>(
        workspaceMentorApi.endEngagement(engagementId),
        { reason },
      )
    ).data,
};
