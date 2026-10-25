import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { TaskAssignee, TaskCardDto } from '../api/boards.types';
import { taskDetailService } from '../api/task-detail.service';
import type { TaskDetailDto, TaskPatchPayload } from '../api/task-detail.types';
import { applyEventToBoardCaches, revertCardInBoardCaches, snapshotBoardCaches } from '../hooks/board-cache';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { getHttpStatus } from '../utils/error-details';
import { updateCardInBoardCaches, findCardInBoardCaches } from '../utils/task-cache';
import {
  applyOptimisticPatch,
  cardOf,
  detailFromCard,
  type OptimisticPatch,
} from '../utils/task-detail-cache';
import { taskKeys } from './task-detail.keys';

/**
 * Chi tiết thẻ. `placeholderData` (KHÔNG phải `initialData`) dựng từ thẻ mini trong cache bảng:
 * tiêu đề/chip hiện ngay, còn `isPlaceholderData` cho màn biết mô tả/checklist/quyền chưa có thật
 * — `initialData` sẽ bị coi là dữ liệu THẬT và không tải lại khi còn "tươi".
 * 404 KHÔNG thử lại: thẻ đã xoá/không còn quyền là câu trả lời cuối.
 */
export function useTaskDetail(boardId: string, taskId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => taskDetailService.get(taskId),
    placeholderData: () => {
      const card = findCardInBoardCaches(queryClient, boardId, taskId);
      return card ? detailFromCard(card) : undefined;
    },
    retry: (failureCount, error) => getHttpStatus(error) !== 404 && failureCount < 1,
    staleTime: 15_000,
  });
}

export interface PatchTaskVariables {
  /** Trường gửi lên — `expectedVersion` được thêm ở đây từ cache lúc GỌI (không phải lúc tạo hook). */
  patch: Omit<TaskPatchPayload, 'expectedVersion'>;
  /** Bản hiển thị ngay (tên người làm, nhãn…) — `PATCH` chỉ mang id. */
  optimistic: OptimisticPatch;
}

function cardPatch(card: TaskCardDto, optimistic: OptimisticPatch): TaskCardDto {
  const dueDate = optimistic.dueDate === undefined ? card.dueDate : optimistic.dueDate;
  return {
    ...card,
    assignees: optimistic.assignees ?? card.assignees,
    dueDate,
    isOverdue:
      optimistic.dueDate === undefined
        ? card.isOverdue
        : dueDate !== null && card.columnKind !== 'DONE' && new Date(dueDate).getTime() < Date.now(),
    labelIds: optimistic.labelIds ?? card.labelIds,
    storyPoints: optimistic.storyPoints === undefined ? card.storyPoints : optimistic.storyPoints,
    title: optimistic.title ?? card.title,
  };
}

/**
 * `PATCH /tasks/:id` — optimistic cập nhật `detail` VÀ thẻ mini trong mọi cache bảng (app.md §4
 * "Sửa trường"); lỗi → hoàn tác cả hai. `expectedVersion` đọc từ cache lúc gọi; 409 `RES_003` do
 * NƠI GỌI xử lý (`useTaskDetailState.save`: banner + tải lại + giữ giá trị đang nhập).
 */
export function usePatchTask(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const detailKey = taskKeys.detail(taskId);

  return useMutation({
    mutationFn: ({ patch }: PatchTaskVariables) => {
      const version = queryClient.getQueryData<TaskDetailDto>(detailKey)?.version;
      if (version === undefined) return Promise.reject(new Error('Chi tiết thẻ chưa tải xong'));
      return taskDetailService.patch(taskId, { ...patch, expectedVersion: version });
    },

    onMutate: async ({ optimistic }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<TaskDetailDto>(detailKey);
      const boardSnapshots = snapshotBoardCaches(queryClient, boardId);
      queryClient.setQueryData<TaskDetailDto>(detailKey, (detail) =>
        detail ? applyOptimisticPatch(detail, optimistic) : detail,
      );
      updateCardInBoardCaches(queryClient, boardId, taskId, (card) => cardPatch(card, optimistic));
      return { boardSnapshots, previous };
    },

    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(detailKey, context.previous);
      // Chỉ trả CHÍNH thẻ này về bản trước khi sửa — kéo/tạo thẻ khác trong lúc chờ không bị hoàn tác theo.
      revertCardInBoardCaches(queryClient, context.boardSnapshots, taskId);
    },

    onSuccess: (detail) => {
      queryClient.setQueryData(detailKey, detail);
      applyEventToBoardCaches(queryClient, boardId, { task: cardOf(detail), type: 'updated' }, currentUserId);
      // Tên/người nhận/điểm/hạn đổi ⇒ Gantt (nằm dưới modal thẻ), báo cáo đóng góp, % của danh sách bảng.
      invalidateBoardDerived(queryClient, boardId);
    },
  });
}

/** `POST /tasks/:id/restore` — thẻ về cuối cột cũ (BE); chèn lại vào bảng và tải lại chi tiết. */
export function useRestoreTask(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: () => taskDetailService.restore(taskId),
    onSuccess: (card) => {
      applyEventToBoardCaches(queryClient, boardId, { task: card, type: 'created' }, currentUserId);
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
      invalidateBoardDerived(queryClient, boardId);
    },
  });
}

/** Người dùng hiện tại dưới dạng `TaskAssignee` — cho optimistic "Giao cho tôi". */
export function useMeAsAssignee(): TaskAssignee | undefined {
  const user = useAuthStore((state) => state.user);
  return user ? { avatarUrl: user.avatar ?? null, id: user.id, name: user.name } : undefined;
}

/**
 * Giải deep link `/w/{wsId}/t/{taskId}` (app.md §1): link chỉ có `taskId`, còn route chi tiết cần `boardId` —
 * lấy từ chính `GET /tasks/:id`. Dùng CÙNG khoá `taskKeys.detail` nên màn chi tiết mở ngay sau đó có sẵn dữ
 * liệu thật trong cache, không gọi lần hai.
 */
export function useResolveTask(taskId: string) {
  return useQuery({
    queryFn: () => taskDetailService.get(taskId),
    queryKey: taskKeys.detail(taskId),
    retry: (failureCount, error) => getHttpStatus(error) !== 404 && failureCount < 1,
    staleTime: 15_000,
  });
}
