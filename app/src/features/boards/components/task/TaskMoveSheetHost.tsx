import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { BoardColumn, TaskCardDto } from '../../api/boards.types';
import { useBoardScopeValue } from '../../hooks/board-scope.context';
import { useMoveTask } from '../../hooks/useMoveTask';
import { useBoardTasks } from '../../queries/tasks.queries';
import { taskKeys } from '../../queries/task-detail.keys';
import { MoveTaskSheet } from '../MoveTaskSheet';

export interface TaskMoveSheetHostProps {
  boardId: string;
  columns: readonly BoardColumn[];
  /** Mất mạng / không có quyền chuyển thẻ. */
  disabled: boolean;
  task: TaskCardDto;
  visible: boolean;
  onClose: () => void;
}

/**
 * Chip "Cột: …" của màn chi tiết mở lại `MoveTaskSheet` của p3-02 — đổi cột và vị trí dùng đúng `planMove`
 * + `useMoveTask` (optimistic, 409 `RES_003`, hoàn tác) chứ không viết đường chuyển thứ hai.
 *
 * Danh sách thẻ của bảng (hàng xóm để tính vị trí) chỉ tải KHI tấm mở — mở chi tiết từ link không phải
 * kéo cả bảng chỉ để hiện chi tiết. Chuyển xong thì tải lại chi tiết: `useMoveTask` chỉ vá cache bảng.
 */
export function TaskMoveSheetHost({
  boardId,
  columns,
  disabled,
  task,
  visible,
  onClose,
}: TaskMoveSheetHostProps) {
  const queryClient = useQueryClient();
  const { pendingMutations } = useBoardScopeValue();
  const board = useBoardTasks(boardId, {}, visible);
  const move = useMoveTask(boardId, pendingMutations);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !move.isPending) {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(task.id) });
    }
    wasPending.current = move.isPending;
  }, [move.isPending, queryClient, task.id]);

  return (
    <MoveTaskSheet
      columns={columns}
      disabled={disabled || !board.data}
      task={visible ? task : null}
      tasks={board.data?.columns ?? {}}
      onClose={onClose}
      onMove={move.move}
    />
  );
}
