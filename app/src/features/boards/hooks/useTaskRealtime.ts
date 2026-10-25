import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';

import type {
  TaskCreatedPayload,
  TaskDeletedPayload,
  TaskMovedPayload,
  TaskUpdatedPayload,
} from '../api/boards.types';
import type {
  TaskActivityEvent,
  TaskCommentView,
  TaskDetailDto,
  TaskActivityDto,
} from '../api/task-detail.types';
import { DETAIL_REFETCH_DEBOUNCE_MS } from '../constants/task-detail.constants';
import { taskKeys } from '../queries/task-detail.keys';
import { prependActivity, upsertComment, type PagesData } from '../utils/comment-feed';
import { decodeComment } from '../utils/html-entities';
import { mergeCardIntoDetail, needsDetailRefetch } from '../utils/task-detail-cache';

/** `task:updated` kèm `changed` (be.md §6) — tên trường đã đổi, để biết có phải tải lại chi tiết không. */
type TaskUpdatedEvent = TaskUpdatedPayload & { changed?: string[] };

/**
 * Nghe `task:*` của ĐÚNG thẻ đang mở (room `board:{id}` do `BoardScopeProvider` đã vào) và vá cache
 * chi tiết/activity/bình luận (app.md §4 "Realtime"). Cache THẺ MINI của bảng do `useBoardRealtime` lo.
 *
 *  · `task:updated`  — version mới hơn → trộn trường thẻ mini ngay; trường CHỈ có ở chi tiết
 *    (mô tả, checklist, ngày bắt đầu, đính kèm, nhãn) → tải lại chi tiết, gộp cú dồn dập trong 800 ms
 *    (tick liền 10 mục, PM2-22). Số bình luận GIẢM (ai đó xoá) → tải lại danh sách bình luận.
 *  · `task:activity` — chèn activity/bình luận; bản của CHÍNH MÌNH khớp `clientCommentId` nên hội tụ về một dòng.
 *  · `task:moved`    — cột/khoá mới (kéo thả trên máy khác).
 *  · `task:deleted` / `task:created{restored}` — tải lại: banner "đã xoá" hoặc 404 do BE quyết theo quyền.
 */
export function useTaskRealtime(taskId: string): void {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refetchDetail = (immediately: boolean) => {
    clearTimeout(timer.current);
    const run = () => void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    if (immediately) run();
    else timer.current = setTimeout(run, DETAIL_REFETCH_DEBOUNCE_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useSocketEvent<TaskUpdatedEvent>(SocketEvent.TASK_UPDATED, (payload) => {
    if (payload.task.id !== taskId) return;
    const detail = queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId));
    if (!detail) return;

    const merged = mergeCardIntoDetail(detail, payload.task);
    if (!merged) return;
    queryClient.setQueryData(taskKeys.detail(taskId), merged);
    if (needsDetailRefetch(payload.changed)) refetchDetail(false);
    if (payload.task.commentCount < detail.commentCount) {
      void queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
    }
  });

  useSocketEvent<TaskMovedPayload>(SocketEvent.TASK_MOVED, (payload) => {
    if (payload.id !== taskId) return;
    queryClient.setQueryData<TaskDetailDto>(taskKeys.detail(taskId), (detail) =>
      detail && payload.version > detail.version
        ? {
            ...detail,
            columnId: payload.columnId,
            columnKind: payload.columnKind,
            completedAt: payload.completedAt,
            position: payload.position,
            version: payload.version,
          }
        : detail,
    );
    void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
  });

  useSocketEvent<TaskActivityEvent>(
    SocketEvent.TASK_ACTIVITY,
    ({ activity, taskId: eventTaskId }) => {
      if (eventTaskId !== taskId) return;
      if ('comment' in activity) {
        queryClient.setQueryData<PagesData<TaskCommentView>>(taskKeys.comments(taskId), (data) =>
          upsertComment(data, decodeComment(activity.comment)),
        );
        return;
      }
      queryClient.setQueryData<PagesData<TaskActivityDto>>(taskKeys.activity(taskId), (data) =>
        prependActivity(data, activity),
      );
      // Quản trị viên xoá bình luận của người khác: không có sự kiện xoá riêng → tải lại danh sách.
      if (activity.type === 'COMMENT_DELETED_BY_ADMIN') {
        void queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
      }
    },
  );

  useSocketEvent<TaskDeletedPayload>(SocketEvent.TASK_DELETED, (payload) => {
    if (payload.id === taskId) refetchDetail(true);
  });

  useSocketEvent<TaskCreatedPayload & { restored?: boolean }>(
    SocketEvent.TASK_CREATED,
    (payload) => {
      if (payload.task.id === taskId && payload.restored) refetchDetail(true);
    },
  );

  // Mất kết nối rồi nối lại: sự kiện trong lúc mất là mất hẳn ⇒ tải lại mọi thứ của thẻ.
  useEffect(
    () =>
      onRoomResync(() => {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
        void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
        void queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
      }),
    [queryClient, taskId],
  );
}
