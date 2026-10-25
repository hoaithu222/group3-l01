import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import type { TaskDetailDto } from '../api/task-detail.types';
import { taskExtrasService } from '../api/task-extras.service';
import { applyEventToBoardCaches } from '../hooks/board-cache';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { updateCardInBoardCaches } from '../utils/task-cache';
import { applyChecklistRemoved, withChecklist } from '../utils/task-detail-cache';
import { taskKeys } from './task-detail.keys';

/**
 * Chuyển một việc nhỏ thành thẻ (`POST /tasks/:id/checklist/:itemId/convert`): việc nhỏ biến khỏi checklist NGAY (optimistic, như "Xoá việc
 * nhỏ"), thẻ mới chèn vào mọi cache thẻ của bảng khi BE trả về. Lỗi (`404` mục không còn, `TASK_010` bảng đủ thẻ, `TASK_001`, `TASK_002`) →
 * hoàn tác + MỘT toast + tải lại chi tiết — BE cũng đã trả việc nhỏ về checklist khi tạo thẻ lỗi. Gọi lại sau khi đã chuyển → `created: false`
 * (BE trả thẻ đã tạo, không tạo thêm): vẫn gỡ mục và chèn thẻ, chỉ đổi câu báo.
 *
 * ⚠️ `version` của thẻ CHA phải ghi vào `detail` và thẻ mini (mỗi lần gỡ mục tăng `Task.version`, mà `PATCH /tasks/:id` dùng version trong
 * cache làm `expectedVersion`) — cùng lý do `useChecklistMutation`.
 */
export function useConvertChecklistItem(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const detailKey = taskKeys.detail(taskId);

  const syncCard = (counts: { checklistDone: number; checklistTotal: number; version: number }) =>
    updateCardInBoardCaches(queryClient, boardId, taskId, (card) => ({
      ...card,
      checklistDone: counts.checklistDone,
      checklistTotal: counts.checklistTotal,
      version: Math.max(card.version, counts.version),
    }));

  return useMutation({
    mutationFn: ({ itemId }: { itemId: string }) =>
      taskExtrasService.convertChecklistItem(taskId, itemId),

    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<TaskDetailDto>(detailKey);
      if (previous) {
        const next = withChecklist(
          previous,
          previous.checklist.filter((item) => item.id !== itemId),
        );
        queryClient.setQueryData(detailKey, next);
        syncCard(next);
      }
      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
        syncCard(context.previous);
      }
      showToast('error', toErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },

    onSuccess: (result, { itemId }) => {
      const detail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      if (detail) queryClient.setQueryData(detailKey, applyChecklistRemoved(detail, itemId, result.source));
      syncCard(result.source);
      applyEventToBoardCaches(queryClient, boardId, { task: result.task, type: 'created' }, currentUserId);
      // Nhật ký của thẻ cha có dòng mới "đã chuyển việc nhỏ … thành thẻ" (BE `CHECKLIST_REMOVED`, `after.convertedTaskId`).
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
      invalidateBoardDerived(queryClient, boardId);
      showToast('success', result.created ? 'Đã chuyển việc nhỏ thành thẻ mới' : 'Việc nhỏ đã được chuyển thành thẻ trước đó');
    },
  });
}
