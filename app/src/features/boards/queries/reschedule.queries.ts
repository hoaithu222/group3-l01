import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  RescheduleApplyPayload,
  RescheduleApplyResult,
  RescheduleBatchDto,
  RescheduleChange,
} from '../api/critical-path.types';
import { rescheduleService } from '../api/reschedule.service';
import { RESCHEDULE_BATCH_POLL_MS } from '../constants/critical-path.constants';
import { applyRescheduled } from '../utils/reschedule-cache';
import { isBatchActive } from '../utils/reschedule-text';
import { boardKeys } from './boards.keys';
import { taskKeys } from './task-detail.keys';

/** Xem trước dời lịch (chỉ đọc) — dùng cho kéo thanh Gantt: `affectedCount = 0` thì PATCH thẳng, > 0 thì cảnh báo. */
export function useReschedulePreview() {
  return useMutation({
    mutationFn: ({ change, taskId }: { change: RescheduleChange; taskId: string }) =>
      rescheduleService.preview(taskId, change),
  });
}

/**
 * `POST /tasks/:id/reschedule`. `200` → vá thẻ đã dời vào cache ngay; `202` → lô nền, các thẻ sẽ tới qua
 * `board:rescheduled`. Cả hai đều tải lại thẻ NGUỒN (BE tăng `version`/`dueVersion` mà phản hồi không mang bản đủ) và
 * Gantt. Lỗi (`TASK_019/020`, `RES_003`) do `useReschedule` phân loại — không xử lý ở đây.
 *
 * `onDone` chạy ở tầng MUTATION chứ không ở callback của `mutate()`: callback của `mutate()` bị huỷ khi màn unmount,
 * mà người dùng hoàn toàn có thể bấm Quay lại giữa lúc lệnh còn bay — banner lô nền và toast không được mất theo.
 */
export function useApplyReschedule(
  boardId: string,
  onDone?: (result: RescheduleApplyResult) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, taskId }: { payload: RescheduleApplyPayload; taskId: string }) =>
      rescheduleService.apply(taskId, payload),
    onSuccess: (result, { taskId }) => {
      if (result.kind === 'applied') applyRescheduled(queryClient, boardId, result.applied);
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
      void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
      onDone?.(result);
    },
  });
}

/**
 * Trạng thái một lô nền: hỏi lại mỗi 5 s khi còn `QUEUED/RUNNING`, dừng khi kết thúc (app.md §4). Chưa có dữ liệu
 * lần nào (lỗi mạng) thì KHÔNG hỏi vòng vô hạn — `board:rescheduled { final }` sẽ `invalidate` khi lô xong.
 *
 * Lượt hỏi thấy lô CHUYỂN từ đang chạy sang kết thúc thì tải lại thẻ + Gantt của bảng: nếu socket đang mất, đây là lần
 * DUY NHẤT màn biết các thẻ đã được dời (`board:rescheduled` chỉ tới máy còn kết nối).
 */
export function useRescheduleBatch(batchId: string | null, boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.rescheduleBatch(batchId ?? '');

  return useQuery({
    enabled: Boolean(batchId),
    queryFn: async () => {
      const previous = queryClient.getQueryData<RescheduleBatchDto>(key);
      const batch = await rescheduleService.batch(batchId as string);
      if (previous && isBatchActive(previous.status) && !isBatchActive(batch.status)) {
        void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
        void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
      }
      return batch;
    },
    queryKey: key,
    refetchInterval: (query) =>
      isBatchActive(query.state.data?.status) ? RESCHEDULE_BATCH_POLL_MS : false,
    staleTime: 0,
  });
}
