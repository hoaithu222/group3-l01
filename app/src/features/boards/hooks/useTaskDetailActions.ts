import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import type { TaskDetailDto } from '../api/task-detail.types';
import { useAssignToMe, useDeleteTask } from '../queries/task-actions.queries';
import { useRestoreTask } from '../queries/task-detail.queries';
import { boardHref } from '../utils/board-routes';
import { cardOf } from '../utils/task-detail-cache';
import { taskLink } from '../utils/task-link';
import { useSaveWithReschedule } from './useSaveWithReschedule';
import type { useTaskDetailState } from './useTaskDetailState';

export type TaskSheet = 'assignees' | 'dates' | 'delete' | 'duplicate' | 'labels' | 'menu' | 'move' | 'points';

interface Options {
  boardId: string;
  detail: TaskDetailDto | undefined;
  taskId: string;
  wsId: string;
  /** `useTaskDetailState().save` — trả câu lỗi hoặc `null`; tham số 2 nhận preview khi `PATCH` bị `TASK_006`. */
  save: ReturnType<typeof useTaskDetailState>['save'];
}

/**
 * Hành động của màn chi tiết ngoài việc "sửa từng trường": mở/đóng các tấm, lưu từ tấm (lỗi hiện TRONG tấm,
 * giữ nguyên lựa chọn), Giao cho tôi, Sao chép link, Xoá thẻ, Khôi phục. Tách khỏi `useTaskDetailState` để
 * mỗi hook giữ một trách nhiệm (đọc dữ liệu/quyền ↔ thao tác của người dùng).
 *
 * p4-04: lưu từ tấm đi qua `useSaveWithReschedule` — đổi hạn bị `TASK_006` mở `reschedule` (tấm cảnh báo) TRÊN tấm ngày,
 * tấm ngày chỉ đóng khi dời xong.
 */
export function useTaskDetailActions({ boardId, detail, save, taskId, wsId }: Options) {
  const [sheet, setSheet] = useState<TaskSheet | null>(null);
  const remove = useDeleteTask(boardId);
  const restore = useRestoreTask(boardId, taskId);
  const assign = useAssignToMe(boardId);
  const saver = useSaveWithReschedule({
    boardId,
    detail,
    onDone: () => setSheet(null),
    save,
    taskId,
  });

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(boardHref(wsId, boardId));
  };

  return {
    assigning: assign.isPending,
    deleting: remove.isPending,
    reschedule: saver.reschedule,
    restoring: restore.isPending,
    saving: saver.saving,
    sheet,
    sheetError: saver.error,
    assignToMe: () => {
      setSheet(null);
      if (detail) assign.mutate(cardOf(detail));
    },
    close: () => setSheet(null),
    /** Lưu từ tấm: xong thì đóng; lỗi thì ở lại, hiện câu lỗi và giữ lựa chọn. */
    commit: saver.commit,
    confirmDelete: () =>
      remove.mutate(taskId, {
        onSuccess: () => {
          setSheet(null);
          leave();
        },
      }),
    copyLink: () => {
      setSheet(null);
      void Clipboard.setStringAsync(taskLink(wsId, taskId)).then(() =>
        showToast('success', 'Đã sao chép link thẻ'),
      );
    },
    leave,
    open: (next: TaskSheet) => {
      saver.clearError();
      setSheet(next);
    },
    /** Mở thẻ ở đầu kia của một phụ thuộc: đẩy thêm MỘT màn chi tiết (Back quay về thẻ này). */
    openTask: (otherTaskId: string) =>
      router.push({
        params: { boardId, taskId: otherTaskId, wsId },
        pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
      }),
    restore: () => restore.mutate(),
  };
}
