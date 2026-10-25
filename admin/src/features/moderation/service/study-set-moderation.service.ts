import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminReportedStudySetsParams,
  AdminStudyItem,
  AdminStudyItemsParams,
  AdminStudySet,
  AdminUserStudySummary,
  StudySetDecisionPayload,
} from '../types/study-set-moderation.types';
import { studySetModerationApi } from './study-set-moderation.api';

/**
 * Service THUẦN. `detail`/`items` tắt toast lỗi tự động: `404` (bộ riêng tư/đã xoá/cờ `study` tắt)
 * và `403` (bộ WORKSPACE không xem được nội dung) là TRẠNG THÁI mà khối bộ học vẽ tại chỗ, toast
 * thêm là trùng. Ẩn/khôi phục để interceptor toast lỗi như mọi hành động ghi khác.
 */
export const studySetModerationService = {
  /** Tab `content` — lỗi hiện bằng khối lỗi + "Thử lại" tại chỗ nên không toast thêm. */
  listReported: async (
    params: AdminReportedStudySetsParams,
  ): Promise<ApiResponse<AdminStudySet[]>> =>
    (
      await apiClient.get<ApiResponse<AdminStudySet[]>>(studySetModerationApi.list, {
        params,
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  /** Tab "Học tập" của người dùng — `404` (không có người dùng) và cờ `study` tắt được vẽ tại chỗ nên không toast. */
  userSummary: async (userId: string): Promise<ApiResponse<AdminUserStudySummary>> =>
    (
      await apiClient.get<ApiResponse<AdminUserStudySummary>>(
        studySetModerationApi.userSummary(userId),
        { skipErrorToast: true } as RequestConfig,
      )
    ).data,

  detail: async (setId: string): Promise<ApiResponse<AdminStudySet>> =>
    (
      await apiClient.get<ApiResponse<AdminStudySet>>(studySetModerationApi.detail(setId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  items: async (
    setId: string,
    params: AdminStudyItemsParams,
  ): Promise<ApiResponse<AdminStudyItem[]>> =>
    (
      await apiClient.get<ApiResponse<AdminStudyItem[]>>(studySetModerationApi.items(setId), {
        params,
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  hide: async ({ setId, reason }: StudySetDecisionPayload): Promise<ApiResponse<AdminStudySet>> =>
    (
      await apiClient.post<ApiResponse<AdminStudySet>>(studySetModerationApi.hide(setId), {
        reason,
      })
    ).data,

  restore: async ({
    setId,
    reason,
  }: StudySetDecisionPayload): Promise<ApiResponse<AdminStudySet>> =>
    (
      await apiClient.post<ApiResponse<AdminStudySet>>(studySetModerationApi.restore(setId), {
        reason,
      })
    ).data,
};
