import type { QueryClient } from '@tanstack/react-query';

import type { BoardFilter, BoardTasksData, TaskEvent } from '../api/boards.types';
import { boardKeys } from '../queries/boards.keys';
import { applyTaskEvent } from '../utils/apply-task-event';
import { findTask, insertTask } from '../utils/board-tasks-data';

/** Ảnh chụp mọi cache thẻ của một bảng: `[khoá query, dữ liệu]` (mỗi bộ lọc một cache). */
export type BoardCachesSnapshot = [readonly unknown[], BoardTasksData | undefined][];

/**
 * Áp MỘT sự kiện thẻ lên MỌI cache thẻ của bảng — mỗi bộ lọc là một cache riêng
 * (`boardKeys.tasks(boardId, filter)`), nên reducer chạy theo bộ lọc của từng
 * cache: cache "Của tôi" chỉ nhận thẻ khớp, cache không lọc nhận tất cả.
 *
 * Cache nào reducer báo `stale` (không tự vá được, xem `apply-task-event.ts`)
 * thì được tải lại; còn lại ghi thẳng bằng `setQueryData` — không gọi mạng.
 */
export function applyEventToBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  event: TaskEvent,
  currentUserId: string | undefined,
): void {
  const caches = queryClient.getQueriesData<BoardTasksData>({
    queryKey: boardKeys.tasksAll(boardId),
  });

  for (const [queryKey, data] of caches) {
    if (!data) continue;
    // Khoá là `['boards', 'tasks', boardId, filter]` — xem `boardKeys.tasks`.
    const filter = (queryKey[3] ?? {}) as BoardFilter;
    const result = applyTaskEvent(data, event, { currentUserId, filter });
    if (result.data !== data) queryClient.setQueryData(queryKey, result.data);
    if (result.stale) void queryClient.invalidateQueries({ queryKey });
  }
}

/** Ảnh chụp mọi cache thẻ — để hoàn tác optimistic update (`revertCardInBoardCaches`). */
export function snapshotBoardCaches(queryClient: QueryClient, boardId: string): BoardCachesSnapshot {
  return queryClient.getQueriesData<BoardTasksData>({ queryKey: boardKeys.tasksAll(boardId) });
}

/**
 * Hoàn tác optimistic của MỘT thẻ: trả thẻ `taskId` về đúng bản trong ảnh chụp, ở mọi cache thẻ của bảng.
 *
 * ⛔ KHÔNG ghi lại NGUYÊN ảnh chụp. Ảnh chụp lấy lúc thao tác NÀY bắt đầu, nên ghi lại nó là xoá luôn mọi thứ đổi SAU đó: lượt kéo
 * thẻ khác vừa thành công, thẻ vừa tạo, sự kiện realtime của người khác. Kéo hai thẻ liên tiếp mà lượt đầu hỏng thì thẻ thứ hai
 * (server đã ghi) nhảy về chỗ cũ với `version` cũ — lượt kéo kế tiếp của nó chắc chắn `409`.
 *
 *  · Thẻ trong cache đã có `version` MỚI HƠN bản chụp ⇒ bản của server đã về (sự kiện realtime) — giữ, không lùi về bản cũ.
 *  · Thẻ không còn trong cache (vừa bị xoá ở máy khác) ⇒ không hồi sinh nó.
 *  · Ảnh chụp của cache đó không có thẻ ⇒ optimistic cũng chưa đụng tới cache đó (chỉ sửa thẻ đang có) — để nguyên.
 */
export function revertCardInBoardCaches(
  queryClient: QueryClient,
  snapshots: BoardCachesSnapshot,
  taskId: string,
): void {
  for (const [queryKey, snapshot] of snapshots) {
    const original = snapshot ? findTask(snapshot, taskId) : undefined;
    if (!original) continue;
    queryClient.setQueryData<BoardTasksData>(queryKey, (data) => {
      if (!data) return data;
      const current = findTask(data, taskId);
      if (!current || current.version > original.version) return data;
      return insertTask(data, original);
    });
  }
}

/**
 * Tải lại các cache thẻ CHƯA có dữ liệu của bảng — gọi ở `onSettled` của kéo/tạo thẻ.
 *
 * `cancelQueries` ở `onMutate` huỷ cả lượt tải ĐẦU TIÊN của bộ lọc vừa đổi (gõ tìm / bấm chip rồi kéo thẻ ngay): query đó lùi về
 * "chưa có dữ liệu, không tải" và không có gì gọi lại, nên màn cứ hiện kết quả của bộ lọc TRƯỚC (`placeholderData`) như thể bộ lọc
 * mới không ăn — và thẻ vừa tạo không hiện. Cache đã có dữ liệu không bị đụng (không gọi mạng oan).
 */
export function refetchEmptyBoardCaches(queryClient: QueryClient, boardId: string): void {
  void queryClient.invalidateQueries({
    // Query đang tải lần đầu cũng khớp nhưng vô hại: chưa có dữ liệu thì React Query GỘP vào lượt đang bay, không gọi thêm.
    predicate: (query) => query.state.data === undefined,
    queryKey: boardKeys.tasksAll(boardId),
  });
}
