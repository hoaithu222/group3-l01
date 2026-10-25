import type { BoardTasksData, ColumnKind, MoveTaskResult, TaskCardDto } from '../api/boards.types';
import { COLUMN_KINDS } from '../constants/kanban.constants';
import { computeOverdue } from './apply-task-event';
import { findTask, insertTask, removeTask } from './board-tasks-data';
import { tempKeyBetween } from './position';

export interface OptimisticMoveInput {
  taskId: string;
  columnId: string;
  columnKind: TaskCardDto['columnKind'];
  afterTaskId: string | null;
  beforeTaskId: string | null;
  now?: number;
}

/**
 * Đặt thẻ vào chỗ mới NGAY trong cache (app.md §4 "Kéo thả" bước 3) với khoá
 * TẠM giữa hai hàng xóm. `version` giữ nguyên — chỉ server mới tăng nó.
 *
 * Hàng xóm không tìm thấy trong cột đích (cache lọc, hoặc vừa bị xoá) coi như
 * không có phía đó: khoá tạm chỉ cần đặt thẻ ở CHỖ GẦN ĐÚNG, server sẽ trả khoá
 * thật và `applyMoveResult` sắp lại.
 */
export function applyOptimisticMove(
  data: BoardTasksData,
  input: OptimisticMoveInput,
): BoardTasksData {
  const task = findTask(data, input.taskId);
  if (!task) return data;

  const target = (data.columns[input.columnId] ?? []).filter((item) => item.id !== input.taskId);
  const after = target.find((item) => item.id === input.afterTaskId);
  const before = target.find((item) => item.id === input.beforeTaskId);

  const moved: TaskCardDto = {
    ...task,
    columnId: input.columnId,
    columnKind: input.columnKind,
    isOverdue: computeOverdue(task.dueDate, input.columnKind, input.now ?? Date.now()),
    position: tempKeyBetween(after?.position ?? null, before?.position ?? null),
  };
  return insertTask(removeTask(data, input.taskId), moved);
}

const isColumnKind = (value: unknown): value is ColumnKind =>
  typeof value === 'string' && (COLUMN_KINDS as readonly string[]).includes(value);

/**
 * `409 RES_003 details.current` của `POST /tasks/:id/move` → `MoveTaskResult`, hoặc `null` khi thiếu/sai trường.
 *
 * ⛔ `current` là bản KẾT QUẢ KÉO `{ id, columnId, columnKind, position, version, completedAt }` (be.md §5 Move), KHÔNG phải thẻ đầy
 * đủ: coi nó là `TaskCardDto` rồi chèn vào cache là thẻ mất tiêu đề/nhãn/người làm, và `TaskCardMini` nổ khi đọc `labelIds`. Nơi gọi áp
 * nó như `task:moved` (giữ các trường đang có); `null` ⇒ tải lại thay vì ghi bậy vào cache.
 */
export function parseMoveResult(value: unknown): MoveTaskResult | null {
  if (!value || typeof value !== 'object') return null;
  const { columnId, columnKind, completedAt, id, position, version } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof columnId !== 'string' || typeof position !== 'string') return null;
  if (typeof version !== 'number' || !isColumnKind(columnKind)) return null;
  if (completedAt !== null && typeof completedAt !== 'string') return null;
  return { columnId, columnKind, completedAt, id, position, version };
}

/** Ghi kết quả THẬT của server (`position`/`version`/`completedAt`) rồi sắp lại cột. */
export function applyMoveResult(data: BoardTasksData, result: MoveTaskResult): BoardTasksData {
  const task = findTask(data, result.id);
  if (!task) return data;
  const confirmed: TaskCardDto = {
    ...task,
    columnId: result.columnId,
    columnKind: result.columnKind,
    completedAt: result.completedAt,
    position: result.position,
    version: result.version,
  };
  return insertTask(removeTask(data, result.id), confirmed);
}
