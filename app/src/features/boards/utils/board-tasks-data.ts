import type {
  BoardTasksColumnResponse,
  BoardTasksData,
  TaskCardDto,
} from '../api/boards.types';
import { sortByPosition } from './task-order';

/**
 * Các phép THUẦN trên cache thẻ (`BoardTasksData`) — không I/O, không React.
 * Mọi phép trả về đối tượng MỚI khi có thay đổi và trả lại CHÍNH đối tượng cũ
 * khi không đổi gì, để React Query khỏi thông báo đổi cache oan.
 */

/** `{ columns: [{ columnId, tasks, hasMore }] }` của server → dạng cache theo `columnId`. */
export function normalizeTasksResponse(response: {
  columns: readonly BoardTasksColumnResponse[];
}): BoardTasksData {
  const columns: Record<string, TaskCardDto[]> = {};
  const hasMore: Record<string, boolean> = {};
  for (const column of response.columns) {
    columns[column.columnId] = sortByPosition(column.tasks);
    hasMore[column.columnId] = column.hasMore;
  }
  return { columns, hasMore };
}

export function findTask(data: BoardTasksData, taskId: string): TaskCardDto | undefined {
  for (const tasks of Object.values(data.columns)) {
    const found = tasks.find((task) => task.id === taskId);
    if (found) return found;
  }
  return undefined;
}

/** Gỡ thẻ khỏi mọi cột; không có thẻ đó thì trả lại `data` cũ. */
export function removeTask(data: BoardTasksData, taskId: string): BoardTasksData {
  let changed = false;
  const columns: Record<string, TaskCardDto[]> = {};
  for (const [columnId, tasks] of Object.entries(data.columns)) {
    const next = tasks.filter((task) => task.id !== taskId);
    if (next.length !== tasks.length) changed = true;
    columns[columnId] = next;
  }
  return changed ? { ...data, columns } : data;
}

/** Chèn `task` vào cột `task.columnId` đúng thứ tự `position`. Thẻ cùng id (nếu có) bị thay. */
export function insertTask(data: BoardTasksData, task: TaskCardDto): BoardTasksData {
  const base = removeTask(data, task.id);
  const current = base.columns[task.columnId] ?? [];
  return {
    ...base,
    columns: { ...base.columns, [task.columnId]: sortByPosition([...current, task]) },
  };
}

export function columnTasks(data: BoardTasksData | undefined, columnId: string): TaskCardDto[] {
  return data?.columns[columnId] ?? [];
}
