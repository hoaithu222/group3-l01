import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { boardLabelsPath, boardTasksPath, labelPath, taskMovePath } from './boards.api';
import type {
  BoardFilter,
  BoardLabel,
  BoardTasksColumnResponse,
  BoardTasksData,
  CreateTaskPayload,
  LabelPayload,
  MoveTaskPayload,
  MoveTaskResult,
  TaskCardDto,
} from './boards.types';
import { normalizeTasksResponse } from '../utils/board-tasks-data';

/** Tham số `GET /boards/:id/tasks` từ bộ lọc — be.md §3 `listTasksQuery`. */
export function buildTaskListParams(
  filter: BoardFilter,
  extra?: { columnId?: string; limitPerColumn?: number },
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  if (filter.assigneeId) params.assigneeId = filter.assigneeId;
  if (filter.labelId) params.labelId = filter.labelId;
  // ⛔ CHỈ gửi `overdue=true`, không bao giờ `overdue=false`: BE dùng
  // `z.coerce.boolean()` mà `Boolean('false') === true` — gửi "false" lại BẬT lọc.
  if (filter.overdue) params.overdue = true;
  // Server từ chối `q` < 2 ký tự (`min(2)`) bằng 400 — bỏ qua thay vì lỗi lúc đang gõ.
  if (filter.q && filter.q.length >= 2) params.q = filter.q;
  if (extra?.columnId) params.columnId = extra.columnId;
  if (extra?.limitPerColumn) params.limitPerColumn = extra.limitPerColumn;
  return params;
}

export const tasksService = {
  async list(
    boardId: string,
    filter: BoardFilter,
    extra?: { columnId?: string; limitPerColumn?: number },
  ): Promise<BoardTasksData> {
    const response = await apiClient.get<{ columns: BoardTasksColumnResponse[] }>(
      boardTasksPath(boardId),
      { params: buildTaskListParams(filter, extra) },
    );
    return normalizeTasksResponse(unwrapData<{ columns: BoardTasksColumnResponse[] }>(response));
  },

  /** `Idempotency-Key` sinh khi mở ô thêm nhanh (app.md §4) — mạng chậm bấm hai lần vẫn một thẻ. */
  async create(
    boardId: string,
    payload: CreateTaskPayload,
    idempotencyKey: string,
  ): Promise<TaskCardDto> {
    const response = await apiClient.post<TaskCardDto>(boardTasksPath(boardId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<TaskCardDto>(response);
  },

  /** `skipErrorToast`: `useMoveTask` tự chọn câu báo theo mã lỗi (409 khác lỗi mạng). */
  async move(taskId: string, payload: MoveTaskPayload): Promise<MoveTaskResult> {
    const response = await apiClient.post<MoveTaskResult>(taskMovePath(taskId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<MoveTaskResult>(response);
  },
};

export const labelsService = {
  async list(boardId: string): Promise<BoardLabel[]> {
    const response = await apiClient.get<BoardLabel[]>(boardLabelsPath(boardId));
    return unwrapData<BoardLabel[]>(response);
  },

  async create(boardId: string, payload: LabelPayload): Promise<BoardLabel> {
    // `skipErrorToast`: lỗi (trùng tên 409, TASK_011 quá 50 nhãn) hiện TRONG tấm sửa nhãn.
    const response = await apiClient.post<BoardLabel>(boardLabelsPath(boardId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<BoardLabel>(response);
  },

  async update(labelId: string, payload: Partial<LabelPayload>): Promise<BoardLabel> {
    const response = await apiClient.patch<BoardLabel>(labelPath(labelId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<BoardLabel>(response);
  },

  async remove(labelId: string): Promise<void> {
    await apiClient.delete(labelPath(labelId));
  },
};
