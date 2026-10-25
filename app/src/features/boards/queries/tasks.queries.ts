import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { tasksService, type BoardFilter, type BoardTasksData, type TaskCardDto } from '../api';
import { refetchEmptyBoardCaches } from '../hooks/board-cache';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { columnTasks, findTask, insertTask, removeTask } from '../utils/board-tasks-data';
import { tempKeyBetween } from '../utils/position';
import { boardKeys } from './boards.keys';

/** Thẻ của bảng theo bộ lọc; đổi bộ lọc = đổi khoá = gọi server (app.md §4 "Lọc"). */
export function useBoardTasks(boardId: string | undefined, filter: BoardFilter, enabled = true) {
  return useQuery({
    queryKey: boardKeys.tasks(boardId ?? '', filter),
    queryFn: () => tasksService.list(boardId as string, filter),
    // `enabled` ngoài: KanbanScreen đợi bộ lọc đã lưu đọc xong mới gọi (xem `useBoardFilter`).
    enabled: enabled && Boolean(boardId),
    // Giữ bảng cũ trên màn trong lúc gõ tìm/đổi lọc — không nhấp nháy về skeleton.
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/** Tải thêm cột dài hơn `limitPerColumn` mặc định (100) — BE nhận tối đa 200/cột. */
export function useLoadFullColumn(boardId: string, filter: BoardFilter) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (columnId: string) =>
      tasksService.list(boardId, filter, { columnId, limitPerColumn: 200 }),
    onSuccess: (loaded, columnId) => {
      queryClient.setQueryData<BoardTasksData>(boardKeys.tasks(boardId, filter), (previous) =>
        previous
          ? {
              columns: { ...previous.columns, [columnId]: loaded.columns[columnId] ?? [] },
              hasMore: { ...previous.hasMore, [columnId]: loaded.hasMore[columnId] ?? false },
            }
          : previous,
      );
    },
  });
}

export interface CreateTaskInput {
  columnId: string;
  columnKind: TaskCardDto['columnKind'];
  title: string;
  /** Sinh khi MỞ ô thêm nhanh, giữ tới khi tạo xong (app.md §4). */
  idempotencyKey: string;
}

/** Id tạm `tmp_<khoá>` — sẽ được thay bằng thẻ server; id này không bao giờ gửi lên server. */
export function tempTaskId(idempotencyKey: string): string {
  return `tmp_${idempotencyKey}`;
}

function buildTempTask(
  boardId: string,
  input: CreateTaskInput,
  last: TaskCardDto | undefined,
): TaskCardDto {
  return {
    assignees: [],
    attachmentCount: 0,
    blockedByCount: 0,
    blockingCount: 0,
    boardId,
    checklistDone: 0,
    checklistTotal: 0,
    columnId: input.columnId,
    columnKind: input.columnKind,
    commentCount: 0,
    completedAt: null,
    dueDate: null,
    id: tempTaskId(input.idempotencyKey),
    isOverdue: false,
    labelIds: [],
    position: tempKeyBetween(last?.position ?? null, null),
    reviewState: 'NONE',
    storyPoints: null,
    title: input.title,
    updatedAt: new Date().toISOString(),
    version: 0,
  };
}

/**
 * Tạo thẻ nhanh (optimistic, app.md §4 "Tạo thẻ nhanh"): chèn cuối cột với id tạm
 * rồi thay bằng thẻ server. `task:created` của CHÍNH MÌNH có thể tới TRƯỚC phản
 * hồi HTTP — khi đó thẻ thật đã được reducer chèn, nên `onSuccess` gỡ thẻ tạm rồi
 * chỉ chèn thẻ thật nếu chưa có, thay vì để hai thẻ trùng nhau.
 *
 * `pending` là tập `clientMutationId` đang bay của KanbanScreen (không global).
 */
export function useCreateTask(boardId: string, filter: BoardFilter, pending: Set<string>) {
  const queryClient = useQueryClient();
  const key = boardKeys.tasks(boardId, filter);

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      tasksService.create(
        boardId,
        // `clientMutationId` = khoá đã nằm trong `pending` (onMutate) ⇒ `task:created` của CHÍNH MÌNH bị bỏ
        // ở `useBoardRealtime`, khỏi có lúc thẻ thật và thẻ tạm cùng hiện trước khi HTTP về.
        { clientMutationId: input.idempotencyKey, columnId: input.columnId, title: input.title },
        input.idempotencyKey,
      ),
    onMutate: async (input) => {
      pending.add(input.idempotencyKey);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<BoardTasksData>(key, (data) => {
        if (!data) return data;
        const last = columnTasks(data, input.columnId).at(-1);
        return insertTask(data, buildTempTask(boardId, input, last));
      });
      // Khoá của cache ĐÃ nhận thẻ tạm: đổi bộ lọc trong lúc chờ thì callback sau đọc `key` của lần vẽ mới.
      return { key };
    },
    onError: (error, input, context) => {
      // Chỉ gỡ THẺ TẠM này — ⛔ không ghi lại ảnh chụp cả cache: thêm liên tiếp thì ảnh chụp của thẻ trước chưa có thẻ sau.
      queryClient.setQueryData<BoardTasksData>(context?.key ?? key, (data) =>
        data ? removeTask(data, tempTaskId(input.idempotencyKey)) : data,
      );
      // Toast Ở ĐÂY, không ở `mutate(…, { onError })`: callback theo lượt `mutate` chỉ chạy cho lượt MỚI NHẤT — thẻ trước lỗi sau khi
      // đã bấm thêm thẻ sau thì lỗi im lặng, thẻ tạm cứ thế biến mất.
      showToast('error', toErrorMessage(error));
    },
    onSuccess: (task, input, context) => {
      queryClient.setQueryData<BoardTasksData>(context?.key ?? key, (data) => {
        if (!data) return data;
        const withoutTemp = removeTask(data, tempTaskId(input.idempotencyKey));
        return findTask(withoutTemp, task.id) ? withoutTemp : insertTask(withoutTemp, task);
      });
      // Bản lọc KHÁC của cùng bảng (và `task:created` của chính mình bị bỏ ở realtime) ⇒ đánh dấu cũ, tải khi mở lại — trừ bản vừa ghi.
      const written = hashKey(context?.key ?? key);
      const predicate = (query: { queryHash: string }) => query.queryHash !== written;
      void queryClient.invalidateQueries({ predicate, queryKey: boardKeys.tasksAll(boardId), refetchType: 'none' });
      invalidateBoardDerived(queryClient, boardId);
    },
    onSettled: (_task, _error, input) => {
      pending.delete(input.idempotencyKey);
      refetchEmptyBoardCaches(queryClient, boardId);
    },
  });
}
