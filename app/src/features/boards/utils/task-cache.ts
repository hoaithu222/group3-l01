import type { QueryClient } from '@tanstack/react-query';

import type { BoardTasksData, TaskCardDto } from '../api/boards.types';
import { boardKeys } from '../queries/boards.keys';
import { findTask } from './board-tasks-data';

/**
 * Sửa TẠI CHỖ một thẻ trong cache bảng (cột và thứ tự không đổi) — dành cho optimistic của
 * màn chi tiết: `apply-task-event.ts` bỏ sự kiện `version <=` bản đã có nên không dùng được
 * cho lượt cập nhật lạc quan (chưa có version mới). Không có thẻ ⇒ trả lại `data` cũ.
 */
export function updateCardInData(
  data: BoardTasksData,
  taskId: string,
  update: (card: TaskCardDto) => TaskCardDto,
): BoardTasksData {
  let changed = false;
  const columns: BoardTasksData['columns'] = {};
  for (const [columnId, tasks] of Object.entries(data.columns)) {
    columns[columnId] = tasks.map((task) => {
      if (task.id !== taskId) return task;
      changed = true;
      return update(task);
    });
  }
  return changed ? { ...data, columns } : data;
}

/** Áp `update` lên thẻ `taskId` trong MỌI cache thẻ của bảng (mỗi bộ lọc một cache). */
export function updateCardInBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  taskId: string,
  update: (card: TaskCardDto) => TaskCardDto,
): void {
  queryClient.setQueriesData<BoardTasksData>({ queryKey: boardKeys.tasksAll(boardId) }, (data) =>
    data ? updateCardInData(data, taskId, update) : data,
  );
}

/** Thẻ mini trong bất kỳ cache bảng nào — nguồn `placeholderData` của màn chi tiết. */
export function findCardInBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  taskId: string,
): TaskCardDto | undefined {
  const caches = queryClient.getQueriesData<BoardTasksData>({ queryKey: boardKeys.tasksAll(boardId) });
  for (const [, data] of caches) {
    const card = data ? findTask(data, taskId) : undefined;
    if (card) return card;
  }
  return undefined;
}
