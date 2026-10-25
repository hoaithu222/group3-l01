import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { taskAttachmentsService } from '../api/task-attachments.service';
import type { AttachmentDto, AttachResult, TaskDetailDto } from '../api/task-detail.types';
import { updateCardInBoardCaches } from '../utils/task-cache';
import { taskKeys } from './task-detail.keys';

export function useTaskAttachments(taskId: string) {
  return useQuery({
    queryFn: () => taskAttachmentsService.list(taskId),
    queryKey: taskKeys.attachments(taskId),
    // Ngắn hơn TTL ký của `thumbnailUrl` (≤ 60 s, be.md p0-05) để thumbnail không hết hạn giữa chừng.
    staleTime: 45_000,
  });
}

/** `attachmentCount` ở chi tiết VÀ thẻ mini trong cache bảng (dòng "📎 N" trên thẻ). */
function setAttachmentCount(
  queryClient: QueryClient,
  boardId: string,
  taskId: string,
  count: number,
): void {
  queryClient.setQueryData<TaskDetailDto>(taskKeys.detail(taskId), (detail) =>
    detail ? { ...detail, attachmentCount: count } : detail,
  );
  updateCardInBoardCaches(queryClient, boardId, taskId, (card) => ({
    ...card,
    attachmentCount: count,
  }));
}

/**
 * Ghi kết quả `POST /tasks/:id/attachments` vào cache. Hàm THUẦN-theo-`queryClient` (không hook) vì
 * chỗ gọi là bộ hoàn tất upload `useTaskAttachmentFinalizer`, chạy theo `taskId` đọc từ hàng đợi.
 */
export function applyAttachResult(
  queryClient: QueryClient,
  boardId: string,
  taskId: string,
  { attachment, attachmentCount }: AttachResult,
): void {
  queryClient.setQueryData<AttachmentDto[]>(taskKeys.attachments(taskId), (list) =>
    list && !list.some((item) => item.assetId === attachment.assetId)
      ? [...list, attachment]
      : list,
  );
  setAttachmentCount(queryClient, boardId, taskId, attachmentCount);
  void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
}

/** Gỡ đính kèm: biến mất NGAY, lỗi thì hoàn tác (interceptor toast 403 "gỡ tệp của người khác"). */
export function useDetachFromTask(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const key = taskKeys.attachments(taskId);

  return useMutation({
    mutationFn: (assetId: string) => taskAttachmentsService.detach(taskId, assetId),
    onMutate: async (assetId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AttachmentDto[]>(key);
      const next = previous?.filter((item) => item.assetId !== assetId);
      queryClient.setQueryData(key, next);
      if (next) setAttachmentCount(queryClient, boardId, taskId, next.length);
      return { previous };
    },
    onError: (_error, _assetId, context) => {
      queryClient.setQueryData(key, context?.previous);
      if (context?.previous)
        setAttachmentCount(queryClient, boardId, taskId, context.previous.length);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
    },
  });
}
