import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';

import type { TaskUpdatedPayload } from '../api/boards.types';
import type { BoardRescheduledPayload } from '../api/critical-path.types';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';

/**
 * Sự kiện realtime CỦA p4-04 (app.md §4 dòng "Realtime"/"Reconnect"). Việc VÀO phòng do `useBoardScope` lo; thẻ mini do
 * `useBoardRealtime` vá — hook này chỉ lo phần MÀ HAI HOOK ĐÓ KHÔNG BIẾT:
 *
 *  · `board:rescheduled` (dời > 50 thẻ, hoặc mỗi lượt của lô nền) — BE KHÔNG phát `task:updated` từng thẻ nên phải
 *    tải lại thẻ của bảng, Gantt, và `detail` của những thẻ trong `taskIds` MÀ ĐANG CÓ trong cache (thẻ chưa từng mở
 *    thì không tải: nó sẽ tải mới khi mở). `final` → tải lại trạng thái lô để banner chuyển sang kết quả.
 *  · `task:updated` có `changed` chứa `dependencies` → chỉ danh sách phụ thuộc CỦA THẺ ĐÓ + Gantt (mũi tên); chứa
 *    `dates` → Gantt (thanh đổi chỗ). Thẻ khác không bị đụng.
 *
 * Bỏ sự kiện của bảng khác: room `board:{id}` chỉ có một bảng nhưng socket dùng chung cho nhiều phòng.
 */
export function useRescheduleRealtime(boardId: string): void {
  const queryClient = useQueryClient();

  useSocketEvent<BoardRescheduledPayload>(SocketEvent.BOARD_RESCHEDULED, (payload) => {
    if (payload.boardId !== boardId) return;
    void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
    void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
    for (const taskId of payload.taskIds) {
      if (queryClient.getQueryState(taskKeys.detail(taskId))) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      }
    }
    if (payload.final && payload.batchId) {
      void queryClient.invalidateQueries({ queryKey: boardKeys.rescheduleBatch(payload.batchId) });
    }
  });

  useSocketEvent<TaskUpdatedPayload>(SocketEvent.TASK_UPDATED, (payload) => {
    if (payload.task.boardId !== boardId) return;
    if (payload.changed?.includes('dependencies')) {
      void queryClient.invalidateQueries({ queryKey: taskKeys.dependencies(payload.task.id) });
      void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
    }
    if (payload.changed?.includes('dates')) {
      void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
    }
  });

  // Nối lại sau khi mất kết nối: sự kiện trong lúc mất là mất hẳn. Thẻ do `useBoardRealtime` lo, phần Gantt ở đây.
  useEffect(
    () =>
      onRoomResync(() => {
        void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
      }),
    [boardId, queryClient],
  );
}
