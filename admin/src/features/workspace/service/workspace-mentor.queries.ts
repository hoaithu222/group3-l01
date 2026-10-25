import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { workspaceMentorService } from './workspace-mentor.service';

/** Key theo admin.md p6-03 §3: `['workspace', id, 'mentor']`. */
export const workspaceMentorKeys = {
  overview: (workspaceId: string) => ['workspace', workspaceId, 'mentor'] as const,
};

/** Bài + đợt cố vấn của nhóm. Chỉ mount khi cờ `mentor` bật + có `workspace:view` (xem `WorkspaceDetailPage`). */
export const useWorkspaceMentor = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: workspaceMentorKeys.overview(workspaceId ?? ''),
    queryFn: () => workspaceMentorService.overview(workspaceId as string),
    enabled: !!workspaceId,
  });

/**
 * `POST /admin/mentor/engagements/:id/end` (`workspace:update`) — audit `mentor.engagement-end-platform`. Làm mới bảng + nhật ký; cả khi lỗi cũng làm
 * mới (đặc biệt `MENTOR_009`: đợt vừa tự hết hạn/được kết thúc ở nơi khác — trạng thái đang hiện đã cũ).
 */
export const useEndMentorEngagement = (workspaceId: string) => {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workspaceMentorKeys.overview(workspaceId) });
  };
  return useMutation({
    mutationFn: workspaceMentorService.endEngagement,
    onSuccess: () => {
      showToast('success', 'Đã kết thúc đợt cố vấn và ghi nhật ký');
      refresh();
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
    onError: refresh,
  });
};
