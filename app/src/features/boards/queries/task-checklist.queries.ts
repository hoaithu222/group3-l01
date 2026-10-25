import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { taskChecklistService } from '../api/task-checklist.service';
import type { ChecklistResult, TaskDetailDto } from '../api/task-detail.types';
import { applyChecklistMove } from '../utils/checklist';
import { updateCardInBoardCaches } from '../utils/task-cache';
import {
  applyChecklistRemoved,
  applyChecklistResult,
  withChecklist,
} from '../utils/task-detail-cache';
import { taskKeys } from './task-detail.keys';

interface ChecklistMutationOptions<V> {
  boardId: string;
  taskId: string;
  /** Bản hiển thị NGAY (đảo `done`, đổi chữ, dời chỗ, xoá) — bỏ trống nếu chờ phản hồi (thêm mục). */
  optimistic?: (detail: TaskDetailDto, variables: V) => TaskDetailDto;
  request: (variables: V) => Promise<ChecklistResult>;
  /** Ghi phản hồi THẬT của BE (đếm + `version` mới + mục). */
  commit: (detail: TaskDetailDto, result: ChecklistResult, variables: V) => TaskDetailDto;
}

/**
 * Khuôn chung cho mọi thao tác checklist: optimistic trên `detail` → gọi API → ghi phản hồi;
 * lỗi → hoàn tác + MỘT toast + tải lại (mục có thể đã bị người khác xoá). Đếm `checklistDone/Total`
 * và `version` được vá sang thẻ mini trong cache bảng để "2/4" đổi ngay cả khi đóng chi tiết rồi.
 *
 * ⚠️ `version` từ phản hồi PHẢI ghi vào `detail`: mỗi thao tác checklist tăng `Task.version`, mà
 * `PATCH /tasks/:id` dùng version trong cache làm `expectedVersion` — bỏ sót là lần sửa tiêu đề
 * kế tiếp dính 409 oan.
 */
function useChecklistMutation<V>({
  boardId,
  taskId,
  optimistic,
  request,
  commit,
}: ChecklistMutationOptions<V>) {
  const queryClient = useQueryClient();
  const detailKey = taskKeys.detail(taskId);

  const syncCard = (detail: TaskDetailDto) =>
    updateCardInBoardCaches(queryClient, boardId, taskId, (card) => ({
      ...card,
      checklistDone: detail.checklistDone,
      checklistTotal: detail.checklistTotal,
      version: Math.max(card.version, detail.version),
    }));

  return useMutation({
    mutationFn: request,

    onMutate: async (variables: V) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<TaskDetailDto>(detailKey);
      if (optimistic && previous) {
        const next = optimistic(previous, variables);
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

    onSuccess: (result, variables) => {
      const detail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      if (!detail) return;
      const next = commit(detail, result, variables);
      queryClient.setQueryData(detailKey, next);
      syncCard(next);
    },
  });
}

/** Năm thao tác của `ChecklistSection` (app.md §2): thêm · tick · đổi chữ · Lên/Xuống · xoá. */
export function useChecklistActions(boardId: string, taskId: string) {
  const base = { boardId, taskId };

  const add = useChecklistMutation<{ afterItemId?: string; text: string }>({
    ...base,
    commit: (detail, result) => applyChecklistResult(detail, result),
    request: ({ afterItemId, text }) => taskChecklistService.add(taskId, text, afterItemId),
  });

  const toggle = useChecklistMutation<{ done: boolean; itemId: string }>({
    ...base,
    commit: (detail, result) => applyChecklistResult(detail, result),
    optimistic: (detail, { done, itemId }) =>
      withChecklist(
        detail,
        detail.checklist.map((item) => (item.id === itemId ? { ...item, done } : item)),
      ),
    request: ({ done, itemId }) => taskChecklistService.patch(taskId, itemId, { done }),
  });

  const rename = useChecklistMutation<{ itemId: string; text: string }>({
    ...base,
    commit: (detail, result) => applyChecklistResult(detail, result),
    optimistic: (detail, { itemId, text }) =>
      withChecklist(
        detail,
        detail.checklist.map((item) => (item.id === itemId ? { ...item, text } : item)),
      ),
    request: ({ itemId, text }) => taskChecklistService.patch(taskId, itemId, { text }),
  });

  const move = useChecklistMutation<{ itemId: string; moveAfterItemId: string | null }>({
    ...base,
    commit: (detail, result) => applyChecklistResult(detail, result),
    optimistic: (detail, { itemId, moveAfterItemId }) =>
      withChecklist(detail, applyChecklistMove(detail.checklist, itemId, moveAfterItemId)),
    request: ({ itemId, moveAfterItemId }) =>
      taskChecklistService.patch(taskId, itemId, { moveAfterItemId }),
  });

  const remove = useChecklistMutation<{ itemId: string }>({
    ...base,
    commit: (detail, result, { itemId }) => applyChecklistRemoved(detail, itemId, result),
    optimistic: (detail, { itemId }) =>
      withChecklist(
        detail,
        detail.checklist.filter((item) => item.id !== itemId),
      ),
    request: ({ itemId }) => taskChecklistService.remove(taskId, itemId),
  });

  return { add, move, remove, rename, toggle };
}
