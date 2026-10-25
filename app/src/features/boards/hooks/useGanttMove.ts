import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import type { GanttTaskDto, RescheduleChange } from '../api/critical-path.types';
import { taskDetailService } from '../api/task-detail.service';
import { boardKeys } from '../queries/boards.keys';
import { useReschedulePreview } from '../queries/reschedule.queries';
import { TASK_CONFLICT_MESSAGE } from '../queries/task-actions.queries';
import { taskKeys } from '../queries/task-detail.keys';
import { criticalPathErrorMessage, readPreviewFromError } from '../utils/critical-path-errors';
import { getErrorCode } from '../utils/error-details';
import { shiftChange, type GanttDragMode } from '../utils/gantt-shift';
import { cardOf } from '../utils/task-detail-cache';
import { applyEventToBoardCaches } from './board-cache';
import { useReschedule } from './useReschedule';

/**
 * Thả thanh Gantt → xem trước → áp (app.md §4 "Kéo thanh Gantt"): `POST reschedule-preview`;
 *  · `affectedCount = 0` → `PATCH /tasks/:id` THẲNG (không thẻ nào bị ảnh hưởng, khỏi hỏi lại);
 *  · `> 0` → tấm cảnh báo (`useReschedule`); Huỷ → không gọi gì, thanh đã tự về chỗ cũ khi thả.
 *
 * `PATCH` cần `expectedVersion` nhưng Gantt KHÔNG mang `version` (chỉ có preview biết): dùng `preview.source.version` —
 * đúng phiên bản thẻ nguồn mà kế hoạch tính. Không đi qua `usePatchTask` vì hook đó đọc version từ cache CHI TIẾT, mà
 * thẻ trên Gantt thường chưa từng được mở. Preview → PATCH là hai bước nên có thể `TASK_006` (ai đó vừa nối thêm thẻ
 * sau): coi như một preview mới và mở tấm cảnh báo, ⛔ không im lặng bỏ qua.
 */
export function useGanttMove(boardId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const reschedule = useReschedule(boardId);
  const preview = useReschedulePreview();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
    void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
  };

  const request = async (taskId: string, change: RescheduleChange) => {
    try {
      const plan = await preview.mutateAsync({ change, taskId });
      if (plan.affectedCount > 0) {
        reschedule.begin(taskId, plan, change);
        return;
      }
      const detail = await taskDetailService.patch(taskId, {
        dueDate: change.dueDate,
        expectedVersion: plan.source.version,
        startDate: change.startDate,
      });
      queryClient.setQueryData(taskKeys.detail(taskId), detail);
      applyEventToBoardCaches(queryClient, boardId, { task: cardOf(detail), type: 'updated' }, currentUserId);
      void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
      showToast('success', 'Đã đổi lịch thẻ');
    } catch (error) {
      const code = getErrorCode(error);
      const fresh = code === 'TASK_006' ? readPreviewFromError(error) : null;
      if (fresh) {
        reschedule.begin(taskId, fresh, change);
      } else if (code === 'RES_003') {
        refresh();
        showToast('warning', TASK_CONFLICT_MESSAGE);
      } else {
        showToast('error', criticalPathErrorMessage(error));
      }
    }
  };

  return {
    reschedule,
    /** Kéo `days` ngày; thẻ không dời được (không có hạn chót) hoặc không đổi gì thì bỏ qua. */
    shift: (task: GanttTaskDto, mode: GanttDragMode, days: number) => {
      const change = shiftChange(task, mode, days);
      if (change) void request(task.id, change);
    },
  };
}
