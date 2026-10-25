import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import type {
  BoardDetail,
  BoardUpdatedPayload,
  TaskCreatedPayload,
  TaskDeletedPayload,
  TaskMovedPayload,
  TaskUpdatedPayload,
} from '../api/boards.types';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { invalidateRemoteBoardDerived } from '../utils/board-derived-cache';
import { applyEventToBoardCaches } from './board-cache';

/**
 * Map sự kiện `board:*`/`task:*` (be.md §6) vào cache React Query (app.md §4
 * "Sự kiện realtime"). Việc VÀO phòng do `useBoardScope` lo; hook này chỉ NGHE.
 *
 * `pending` = các `clientMutationId` của CHÍNH MÌNH còn đang bay: sự kiện mang
 * mã đó bị bỏ, để thao tác optimistic không bị chính bản tin của nó ghi đè giữa
 * chừng. Sau khi HTTP xong, `version <=` trong reducer tự loại phần còn lại.
 */
export function useBoardRealtime(boardId: string, pending: ReadonlySet<string>): void {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const derivedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isOwnPending = (clientMutationId: string | undefined): boolean =>
    Boolean(clientMutationId && pending.has(clientMutationId));

  /**
   * Thẻ đổi do NGƯỜI KHÁC ⇒ số liệu suy ra ngoài cache thẻ (danh sách bảng, Gantt, báo cáo đóng góp) cũng cũ — gom mọi sự
   * kiện trong 1 s thành MỘT lượt làm mới (kéo thả hàng loạt không thành mưa request). Thao tác của chính mình: mutation lo.
   */
  const scheduleDerivedRefresh = () => {
    if (derivedTimer.current) clearTimeout(derivedTimer.current);
    derivedTimer.current = setTimeout(() => invalidateRemoteBoardDerived(queryClient, boardId), 1000);
  };
  useEffect(() => () => clearTimeout(derivedTimer.current), []);

  useSocketEvent<TaskCreatedPayload>(SocketEvent.TASK_CREATED, (payload) => {
    if (payload.task.boardId !== boardId || isOwnPending(payload.clientMutationId)) return;
    applyEventToBoardCaches(queryClient, boardId, { task: payload.task, type: 'created' }, currentUserId);
    scheduleDerivedRefresh();
  });

  useSocketEvent<TaskUpdatedPayload>(SocketEvent.TASK_UPDATED, (payload) => {
    if (payload.task.boardId !== boardId || isOwnPending(payload.clientMutationId)) return;
    applyEventToBoardCaches(queryClient, boardId, { task: payload.task, type: 'updated' }, currentUserId);
    scheduleDerivedRefresh();
  });

  useSocketEvent<TaskMovedPayload>(SocketEvent.TASK_MOVED, (payload) => {
    // Socket dùng chung cho mọi phòng: mở bảng B chồng lên bảng A thì cả hai `board:{id}` cùng nghe. Thẻ của bảng khác không có
    // trong cache ⇒ reducer báo `stale` ⇒ tải lại cả bảng này sau MỖI lượt kéo ở bảng kia.
    if (isOwnPending(payload.clientMutationId) || (payload.boardId && payload.boardId !== boardId)) return;
    const patch = {
      columnId: payload.columnId,
      columnKind: payload.columnKind,
      completedAt: payload.completedAt,
      id: payload.id,
      position: payload.position,
      version: payload.version,
    };
    applyEventToBoardCaches(queryClient, boardId, { patch, type: 'moved' }, currentUserId);
    // Chi tiết thẻ đang cache (đóng modal rồi) giữ cột/`version` cũ — mở lại thấy cột cũ, sửa tiếp là 409.
    void queryClient.invalidateQueries({ queryKey: taskKeys.detail(payload.id) });
    scheduleDerivedRefresh();
  });

  useSocketEvent<TaskDeletedPayload>(SocketEvent.TASK_DELETED, (payload) => {
    applyEventToBoardCaches(queryClient, boardId, { id: payload.id, type: 'deleted' }, currentUserId);
    scheduleDerivedRefresh();
  });

  useSocketEvent<BoardUpdatedPayload>(SocketEvent.BOARD_UPDATED, (payload) => {
    if (payload.boardId !== boardId) return;
    const cached = queryClient.getQueryData<BoardDetail>(boardKeys.detail(boardId));
    // `labelsChanged`: đổi nhãn KHÔNG tăng `version` của bảng — chỉ so version thì máy khác không bao giờ
    // thấy nhãn mới. Xoá nhãn đang dùng còn gỡ `labelIds` khỏi thẻ; vượt ngưỡng BE không phát
    // `task:updated` từng thẻ (chỉ dựa vào cờ này) nên tải lại cả thẻ.
    if (payload.labelsChanged || !cached || payload.version > cached.version) {
      void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    }
    // Server vừa nén lại khoá của một cột — thứ tự tương đối không đổi nhưng
    // `position` đổi hết, phải tải lại để các sự kiện sau so khoá đúng.
    if (payload.rebalancedColumnId || payload.labelsChanged) {
      void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
    }
    // Công thức tính điểm đổi: `useContributionRealtime` chỉ nghe khi màn Đóng góp ĐANG mở — màn đó mở sau (trong
    // `staleTime`) vẫn thấy điểm cũ. Khoá của `contribution` (`contribution.keys.ts`), ghi tay vì không import chéo feature.
    if (payload.contributionChanged) {
      void queryClient.invalidateQueries({ queryKey: ['contribution', 'board', boardId] });
      void queryClient.invalidateQueries({ queryKey: ['contribution', 'config', boardId] });
    }
  });

  // Mất kết nối rồi nối lại: registry đã join lại phòng (`core/socket`), nhưng
  // sự kiện trong lúc mất kết nối thì mất hẳn ⇒ tải lại (app.md §4 "Reconnect").
  useEffect(
    () =>
      onRoomResync(() => {
        void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
        void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
      }),
    [boardId, queryClient],
  );
}
