import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { taskCommentsService } from '../api/task-comments.service';
import type {
  CreateCommentPayload,
  TaskCommentDto,
  TaskCommentView,
  TaskMention,
} from '../api/task-detail.types';
import {
  hasServerComment,
  patchComment,
  removeComment,
  tempCommentId,
  upsertComment,
  type PagesData,
} from '../utils/comment-feed';
import { getErrorCode } from '../utils/error-details';
import { useBumpCommentCount } from './task-comment-count';
import { taskKeys } from './task-detail.keys';
import { useMeAsAssignee } from './task-detail.queries';

const NO_CURSOR = undefined as string | undefined;

export function useTaskActivity(taskId: string) {
  return useInfiniteQuery({
    queryKey: taskKeys.activity(taskId),
    queryFn: ({ pageParam }) => taskCommentsService.listActivity(taskId, pageParam),
    initialPageParam: NO_CURSOR,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useTaskComments(taskId: string) {
  return useInfiniteQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: ({ pageParam }) => taskCommentsService.listComments(taskId, pageParam),
    initialPageParam: NO_CURSOR,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

/** Thành viên nhắc/giao việc được (MEMBER+ ACTIVE) — tối đa 20/lần, lọc theo `q` phía BE. */
export function useMentionables(boardId: string, q: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(boardId),
    queryFn: () => taskCommentsService.mentionables(boardId, q),
    queryKey: taskKeys.mentionables(boardId, q),
    staleTime: 60_000,
  });
}

export interface SendCommentVariables {
  /** Nhãn hiển thị của các mention (payload chỉ có id) — để bong bóng tạm vẽ đúng chip. */
  mentions: TaskMention[];
  payload: CreateCommentPayload;
}

/**
 * Gửi bình luận (app.md §4 "Bình luận"): chèn ĐẦU bản `sending` với id tạm rồi thay bằng bản server
 * (khớp `clientCommentId`). Lỗi thường → bản đó thành `failed`, "Thử lại" gọi lại với ĐÚNG payload cũ
 * (BE trả bản đã tạo nếu lần trước thực ra thành công). `TASK_014` là lỗi ĐỊNH DANH, không có gì để
 * "thử lại": gỡ bản tạm và để composer giữ nháp + tô đỏ mention (nơi gọi đọc `error.details`).
 */
export function useSendComment(taskId: string) {
  const queryClient = useQueryClient();
  const author = useMeAsAssignee();
  const bumpCount = useBumpCommentCount(taskId);
  const key = taskKeys.comments(taskId);

  return useMutation({
    mutationFn: ({ payload }: SendCommentVariables) => taskCommentsService.create(taskId, payload),

    onMutate: ({ mentions, payload }) => {
      const view: TaskCommentView = {
        attachmentCount: payload.attachmentAssetIds.length,
        attachments: [],
        author: author ?? { avatarUrl: null, id: '', name: 'Bạn' },
        clientCommentId: payload.clientCommentId,
        content: payload.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        editedAt: null,
        id: tempCommentId(payload.clientCommentId),
        localPayload: payload,
        localStatus: 'sending',
        mentions,
        taskId,
        version: 1,
      };
      queryClient.setQueryData<PagesData<TaskCommentView>>(key, (data) =>
        upsertComment(data, view),
      );
    },

    onError: (error, { payload }) => {
      const tempId = tempCommentId(payload.clientCommentId);
      queryClient.setQueryData<PagesData<TaskCommentView>>(key, (data) =>
        getErrorCode(error) === 'TASK_014'
          ? removeComment(data, tempId)
          : patchComment(data, tempId, { localStatus: 'failed' }),
      );
    },

    onSuccess: (comment: TaskCommentDto, { payload }) => {
      const before = queryClient.getQueryData<PagesData<TaskCommentView>>(key);
      const alreadyCounted = hasServerComment(before, payload.clientCommentId);
      queryClient.setQueryData<PagesData<TaskCommentView>>(key, (data) =>
        upsertComment(data, comment),
      );
      if (!alreadyCounted) bumpCount(1);
    },
  });
}
