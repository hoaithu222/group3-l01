import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import { tasksService, type BoardTasksData, type ColumnKind, type TaskCardDto } from '../api';
import type { MoveBlockedDetails } from '../api/reviews.types';
import { boardKeys } from '../queries/boards.keys';
import { invalidateBoardDerived, invalidateTaskDetail } from '../utils/board-derived-cache';
import { getErrorCode, getErrorDetails } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';
import { applyMoveResult, applyOptimisticMove, parseMoveResult } from '../utils/optimistic-move';
import { BoardScopeContext } from './board-scope.context';
import {
  applyEventToBoardCaches,
  refetchEmptyBoardCaches,
  revertCardInBoardCaches,
  snapshotBoardCaches,
} from './board-cache';

export interface MoveTaskInput {
  /** Bản chụp thẻ lúc bấm — `version` của nó là `expectedVersion` (CAS phía server). */
  task: TaskCardDto;
  columnId: string;
  columnKind: ColumnKind;
  afterTaskId: string | null;
  beforeTaskId: string | null;
}

interface MoveVariables extends MoveTaskInput {
  clientMutationId: string;
}

export const MOVE_CONFLICT_MESSAGE = 'Thẻ đã được người khác di chuyển';
/** Câu rơi về (toast) khi chưa có ngữ cảnh bảng để hiện `MoveBlockedSheet` — vd test dựng hook rời. */
export const REVIEW_REQUIRED_MESSAGE = 'Thẻ cần đủ lượt duyệt trước khi hoàn thành';

/** `409 TASK_002 { reason: "REVIEW_REQUIRED", … }` — chặn vào DONE của chấm chéo (p4-05); `TASK_002` lý do khác vẫn là lỗi thường. */
function readReviewRequired(error: unknown): MoveBlockedDetails | null {
  if (getErrorCode(error) !== 'TASK_002') return null;
  const details = getErrorDetails(error);
  return details?.reason === 'REVIEW_REQUIRED' ? (details as unknown as MoveBlockedDetails) : null;
}

/**
 * Di chuyển thẻ — optimistic + hoàn tác (app.md §4 "Kéo thả", README §3).
 *
 *  1. Huỷ query đang bay, chụp ảnh MỌI cache thẻ của bảng, đặt thẻ vào chỗ mới
 *     với khoá tạm (`applyOptimisticMove`).
 *  2. Gọi `POST /tasks/:id/move` (server tự tính khoá thật từ hàng xóm hiện tại).
 *  3. Thành công → ghi `position/version/completedAt` THẬT, sắp lại cột.
 *  4. `409 RES_003 { current }` → hoàn tác, áp `current` như `task:moved`, tải lại
 *     thẻ, toast "Thẻ đã được người khác di chuyển". Lỗi khác → hoàn tác + toast.
 *
 * Hoàn tác chỉ trả CHÍNH thẻ này về chỗ cũ (`revertCardInBoardCaches`) — lượt kéo
 * khác xong trong lúc chờ không bị kéo lùi theo.
 *
 * `clientMutationId` được đăng ký vào `pending` để `task:moved` của CHÍNH MÌNH
 * (tới trước phản hồi HTTP) không ghi đè trạng thái optimistic.
 */
export function useMoveTask(boardId: string, pending: Set<string>) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const scope = useContext(BoardScopeContext);

  const mutation = useMutation({
    mutationFn: (vars: MoveVariables) =>
      tasksService.move(vars.task.id, {
        afterTaskId: vars.afterTaskId,
        beforeTaskId: vars.beforeTaskId,
        clientMutationId: vars.clientMutationId,
        columnId: vars.columnId,
        expectedVersion: vars.task.version,
      }),

    onMutate: async (vars) => {
      pending.add(vars.clientMutationId);
      await queryClient.cancelQueries({ queryKey: boardKeys.tasksAll(boardId) });
      const snapshots = snapshotBoardCaches(queryClient, boardId);
      queryClient.setQueriesData<BoardTasksData>(
        { queryKey: boardKeys.tasksAll(boardId) },
        (data) =>
          data &&
          applyOptimisticMove(data, {
            afterTaskId: vars.afterTaskId,
            beforeTaskId: vars.beforeTaskId,
            columnId: vars.columnId,
            columnKind: vars.columnKind,
            taskId: vars.task.id,
          }),
      );
      return { snapshots };
    },

    onError: (error, vars, context) => {
      if (context) revertCardInBoardCaches(queryClient, context.snapshots, vars.task.id);

      // p4-05: chưa đủ lượt duyệt — server quyết, client chỉ GIẢI THÍCH (thẻ đã về chỗ cũ ở dòng trên); không toast lỗi chung.
      const blocked = readReviewRequired(error);
      if (blocked) {
        if (scope?.showMoveBlocked) scope.showMoveBlocked({ details: blocked, taskId: vars.task.id, taskTitle: vars.task.title });
        else showToast('warning', REVIEW_REQUIRED_MESSAGE);
        return;
      }

      if (getErrorCode(error) === 'RES_003') {
        // `current` chỉ là bản KẾT QUẢ KÉO (xem `parseMoveResult`) ⇒ áp như `task:moved`. Vẫn tải lại: `version` lệch nghĩa là thẻ đã
        // đổi ở nơi khác, có thể cả trường ngoài vị trí (tiêu đề, người làm…) mà `current` không mang.
        const current = parseMoveResult(getErrorDetails(error)?.current);
        if (current) applyEventToBoardCaches(queryClient, boardId, { patch: current, type: 'moved' }, currentUserId);
        void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
        showToast('warning', MOVE_CONFLICT_MESSAGE);
        return;
      }
      // Cột đã bị xoá/đổi ở máy khác (TASK_001) hoặc lỗi khác: dữ liệu cũ có thể sai.
      if (getErrorCode(error) === 'TASK_001') {
        void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
        void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
      }
      showToast('error', toErrorMessage(error));
    },

    onSuccess: (result, vars) => {
      queryClient.setQueriesData<BoardTasksData>(
        { queryKey: boardKeys.tasksAll(boardId) },
        (data) => data && applyMoveResult(data, result),
      );
      invalidateBoardDerived(queryClient, boardId);
      invalidateTaskDetail(queryClient, vars.task.id);
    },

    onSettled: (_result, _error, vars) => {
      pending.delete(vars.clientMutationId);
      refetchEmptyBoardCaches(queryClient, boardId);
    },
  });

  return {
    isPending: mutation.isPending,
    move: (input: MoveTaskInput) =>
      mutation.mutate({ ...input, clientMutationId: newIdempotencyKey('mv') }),
  };
}
