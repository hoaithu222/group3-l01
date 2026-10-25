import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { refreshModeration } from './moderation.queries';
import { mentorPostModerationService } from './mentor-post-moderation.service';

/** Cùng gốc `['moderation']` với `moderationKeys` (p6-03 admin.md §3). */
export const mentorPostModerationKeys = {
  detail: (postId: string) => ['moderation', 'mentor-post', postId] as const,
};

/** Làm mới bài + hàng đợi/chi tiết báo cáo + nhật ký (ẩn bài cũng đóng báo cáo mở của nó). */
function refreshAfterDecision(qc: QueryClient, postId: string): void {
  void qc.invalidateQueries({ queryKey: mentorPostModerationKeys.detail(postId) });
  refreshModeration(qc);
}

/** Bài bị báo cáo. `enabled` để tắt khi đích báo cáo không phải `MENTOR_POST`. */
export const useAdminMentorPost = (postId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: mentorPostModerationKeys.detail(postId ?? ''),
    queryFn: () => mentorPostModerationService.detail(postId as string),
    select: (res) => res.data,
    enabled: enabled && !!postId,
    // 404 (không còn / cờ tắt) không tự khỏi khi gọi lại — vẽ trạng thái ngay.
    retry: false,
  });

/** `POST /admin/mentor/posts/:id/hide` (`moderation:update`) — audit `mentor.post-hide`. */
export const useHideMentorPost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mentorPostModerationService.hide,
    onSuccess: (_res, { postId }) => {
      refreshAfterDecision(qc, postId);
      showToast('success', 'Đã ẩn bài tìm cố vấn và ghi nhật ký');
    },
  });
};

/** `POST /admin/mentor/posts/:id/unhide` (`moderation:update`) — audit `mentor.post-unhide`. */
export const useUnhideMentorPost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mentorPostModerationService.unhide,
    onSuccess: (_res, { postId }) => {
      refreshAfterDecision(qc, postId);
      showToast('success', 'Đã khôi phục bài tìm cố vấn và ghi nhật ký');
    },
  });
};
