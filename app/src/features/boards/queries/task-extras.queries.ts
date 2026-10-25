import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import type { DuplicateTaskPayload, TaskWatchers } from '../api/task-detail.types';
import { taskExtrasService } from '../api/task-extras.service';
import { applyEventToBoardCaches } from '../hooks/board-cache';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { getHttpStatus } from '../utils/error-details';
import { withMyWatchStatus } from '../utils/task-watch';
import { taskKeys } from './task-detail.keys';

/**
 * Người theo dõi thẻ + trạng thái của TÔI (`me`). Không có sự kiện socket cho theo dõi nên cache 30 giây và làm mới khi mở danh sách.
 * 404 (thẻ không còn / mất quyền đọc) KHÔNG thử lại — cùng luật `useTaskDetail`.
 */
export function useTaskWatchers(taskId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(taskId),
    queryFn: () => taskExtrasService.watchers(taskId),
    queryKey: taskKeys.watchers(taskId),
    retry: (failureCount, error) => getHttpStatus(error) !== 404 && failureCount < 1,
    staleTime: 30_000,
  });
}

/**
 * Bật/tắt theo dõi (`PUT`/`DELETE`, idempotent): nút đổi NGAY (optimistic trên `me`), lỗi → hoàn tác + MỘT toast. Xong thì tải lại
 * danh sách để `total` và hàng của tôi đúng (server quyết định tôi có nằm trong danh sách hay không — vd người làm vẫn hiện `IMPLICIT`).
 */
export function useSetTaskWatch(taskId: string) {
  const queryClient = useQueryClient();
  const key = taskKeys.watchers(taskId);

  return useMutation({
    mutationFn: (watch: boolean) =>
      watch ? taskExtrasService.watch(taskId) : taskExtrasService.unwatch(taskId),
    onMutate: async (watch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskWatchers>(key);
      queryClient.setQueryData<TaskWatchers>(key, (data) =>
        data ? withMyWatchStatus(data, { state: watch ? 'EXPLICIT_ON' : 'EXPLICIT_OFF', watching: watch }) : data,
      );
      return { previous };
    },
    onError: (error, _watch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      showToast('error', toErrorMessage(error));
    },
    onSuccess: (status) => {
      queryClient.setQueryData<TaskWatchers>(key, (data) => (data ? withMyWatchStatus(data, status) : data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export interface DuplicateTaskInput {
  /** Sinh MỘT lần cho mỗi lượt (`useAttemptKey`) — vừa là `Idempotency-Key` vừa là `clientTaskId`. */
  idempotencyKey: string;
  payload: Omit<DuplicateTaskPayload, 'clientTaskId'>;
  taskId: string;
}

/**
 * Sao chép thẻ → thẻ mới chèn vào MỌI cache thẻ của bảng (ngay SAU thẻ gốc khi cùng cột — BE tính vị trí), số liệu suy ra (danh sách
 * bảng, Gantt, đóng góp) làm mới. `task:created` của chính mình tới sau cũng vô hại (reducer bỏ bản `version <=`). Phát lại cùng
 * `clientTaskId` → BE trả thẻ cũ (200), cũng chèn được một lần. Lỗi (`TASK_010`, `TASK_001`, `TASK_002`, `VAL_001`) để tấm hiện.
 */
export function useDuplicateTask(boardId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: ({ idempotencyKey, payload, taskId }: DuplicateTaskInput) =>
      taskExtrasService.duplicate(taskId, { ...payload, clientTaskId: idempotencyKey }, idempotencyKey),
    onSuccess: (card) => {
      applyEventToBoardCaches(queryClient, boardId, { task: card, type: 'created' }, currentUserId);
      invalidateBoardDerived(queryClient, boardId);
      showToast('success', 'Đã nhân bản thẻ');
    },
  });
}
