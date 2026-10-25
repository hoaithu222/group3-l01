import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import type { TaskCardDto } from '../api/boards.types';
import { taskDetailService } from '../api/task-detail.service';
import {
  applyEventToBoardCaches,
  revertCardInBoardCaches,
  snapshotBoardCaches,
} from '../hooks/board-cache';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { getErrorCode } from '../utils/error-details';
import { updateCardInBoardCaches } from '../utils/task-cache';
import { cardOf } from '../utils/task-detail-cache';
import { boardKeys } from './boards.keys';
import { reviewKeys } from './reviews.keys';
import { taskKeys } from './task-detail.keys';
import { useMeAsAssignee } from './task-detail.queries';

export const TASK_CONFLICT_MESSAGE = 'Thẻ vừa được người khác thay đổi — đã tải lại';

/**
 * Xoá thẻ (mềm, khôi phục trong 30 ngày — be.md §5): gỡ khỏi mọi cache bảng NGAY khi BE trả 204
 * và bỏ cache chi tiết. Lỗi (403 người không phải tác giả/ADMIN…) do interceptor toast — không
 * optimistic vì thẻ biến mất khỏi bảng rồi hiện lại nếu bị từ chối sẽ nháy khó chịu hơn chờ một nhịp.
 */
export function useDeleteTask(boardId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: (taskId: string) => taskDetailService.remove(taskId),
    onSuccess: (_result, taskId) => {
      applyEventToBoardCaches(queryClient, boardId, { id: taskId, type: 'deleted' }, currentUserId);
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
      invalidateBoardDerived(queryClient, boardId);
      // Thẻ đã xoá không còn được chấm — "Cần chấm của tôi" và huy hiệu tab Tôi đọc danh sách này.
      void queryClient.invalidateQueries({ queryKey: reviewKeys.mineAll });
      showToast('success', 'Đã xoá thẻ');
    },
  });
}

/**
 * "Giao cho tôi" (menu thẻ + menu chi tiết): thêm chính mình vào `assigneeIds` hiện có.
 * `expectedVersion` là version của thẻ mini lúc bấm — 409 `RES_003` (người khác vừa sửa) thì tải lại
 * bảng và báo, KHÔNG tự thử lại với version mới: danh sách người làm có thể đã đổi.
 */
export function useAssignToMe(boardId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const me = useMeAsAssignee();

  return useMutation({
    mutationFn: (task: TaskCardDto) => {
      if (!me) return Promise.reject(new Error('Chưa đăng nhập'));
      const assigneeIds = [...task.assignees.map((assignee) => assignee.id), me.id];
      return taskDetailService.patch(task.id, { assigneeIds, expectedVersion: task.version });
    },

    onMutate: (task) => {
      const boardSnapshots = snapshotBoardCaches(queryClient, boardId);
      if (me) {
        updateCardInBoardCaches(queryClient, boardId, task.id, (card) => ({
          ...card,
          assignees: [...card.assignees, me],
        }));
      }
      return { boardSnapshots };
    },

    onError: (error, task, context) => {
      // Chỉ gỡ "tôi" khỏi CHÍNH thẻ này — kéo/tạo thẻ khác trong lúc chờ không bị hoàn tác theo.
      if (context) revertCardInBoardCaches(queryClient, context.boardSnapshots, task.id);
      if (getErrorCode(error) === 'RES_003') {
        void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
        showToast('warning', TASK_CONFLICT_MESSAGE);
      } else {
        showToast('error', toErrorMessage(error));
      }
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
    },

    onSuccess: (detail) => {
      queryClient.setQueryData(taskKeys.detail(detail.id), detail);
      applyEventToBoardCaches(
        queryClient,
        boardId,
        { task: cardOf(detail), type: 'updated' },
        currentUserId,
      );
      invalidateBoardDerived(queryClient, boardId);
      showToast('success', 'Đã giao thẻ cho bạn');
    },
  });
}
