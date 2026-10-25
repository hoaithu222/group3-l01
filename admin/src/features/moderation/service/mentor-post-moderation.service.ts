import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminMentorPost,
  MentorPostDecisionPayload,
} from '../types/mentor-post-moderation.types';
import { mentorPostModerationApi } from './mentor-post-moderation.api';

/**
 * Service THUẦN. `detail` tắt toast tự động: 404 (bài không còn / cờ `mentor` tắt) là TRẠNG THÁI khối bài vẽ tại chỗ.
 * Ẩn/khôi phục để interceptor toast lỗi như mọi hành động ghi khác.
 */
export const mentorPostModerationService = {
  detail: async (postId: string): Promise<ApiResponse<AdminMentorPost>> =>
    (
      await apiClient.get<ApiResponse<AdminMentorPost>>(mentorPostModerationApi.detail(postId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  hide: async ({
    postId,
    reason,
  }: MentorPostDecisionPayload): Promise<ApiResponse<AdminMentorPost>> =>
    (
      await apiClient.post<ApiResponse<AdminMentorPost>>(mentorPostModerationApi.hide(postId), {
        reason,
      })
    ).data,

  unhide: async ({
    postId,
    reason,
  }: MentorPostDecisionPayload): Promise<ApiResponse<AdminMentorPost>> =>
    (
      await apiClient.post<ApiResponse<AdminMentorPost>>(mentorPostModerationApi.unhide(postId), {
        reason,
      })
    ).data,
};
