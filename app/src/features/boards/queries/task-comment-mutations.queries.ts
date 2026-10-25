import { useMutation, useQueryClient } from '@tanstack/react-query';

import { taskCommentsService } from '../api/task-comments.service';
import type { TaskCommentView } from '../api/task-detail.types';
import { removeComment, upsertComment, type PagesData } from '../utils/comment-feed';
import { useBumpCommentCount } from './task-comment-count';
import { taskKeys } from './task-detail.keys';

export interface EditCommentVariables {
  comment: TaskCommentView;
  content: string;
  mentions: { targetId: string; type: 'USER' }[];
}

/** Sửa bình luận (≤ 15 phút): `TASK_015`/`RES_003` do sheet sửa đọc từ lỗi nên không toast tự động. */
export function useEditComment(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ comment, content, mentions }: EditCommentVariables) =>
      taskCommentsService.update(comment.id, {
        content,
        expectedVersion: comment.version,
        mentions,
      }),
    onSuccess: (comment) => {
      queryClient.setQueryData<PagesData<TaskCommentView>>(taskKeys.comments(taskId), (data) =>
        upsertComment(data, comment),
      );
    },
  });
}

/** Xoá bình luận: gỡ NGAY, lỗi thì hoàn tác (interceptor toast). Người khác xoá → `reason` bắt buộc. */
export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient();
  const bumpCount = useBumpCommentCount(taskId);
  const key = taskKeys.comments(taskId);

  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason?: string }) =>
      taskCommentsService.remove(commentId, reason),
    onMutate: async ({ commentId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PagesData<TaskCommentView>>(key);
      queryClient.setQueryData<PagesData<TaskCommentView>>(key, (data) =>
        removeComment(data, commentId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: () => {
      bumpCount(-1);
      void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
    },
  });
}
