import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { TaskCommentView, TaskDetailDto } from '../api/task-detail.types';
import type { FeedSegment } from '../constants/task-detail.constants';
import { useSendComment, useTaskActivity, useTaskComments } from '../queries/task-comments.queries';
import { taskKeys } from '../queries/task-detail.keys';
import { flattenPages, mergeFeed, removeComment, type PagesData } from '../utils/comment-feed';

/**
 * Luồng "Hoạt động · Bình luận · Tất cả" của màn chi tiết (app.md §2 `ActivityFeed`): hai truy vấn cursor
 * độc lập trộn theo thời gian (mới → cũ), nút "Tải thêm" nạp trang kế của cả hai nguồn đang hiển thị.
 * Cũng giữ đích của hai thao tác cần hộp thoại — sửa và xoá một bình luận.
 */
export function useTaskFeed(taskId: string, detail: TaskDetailDto | undefined) {
  const queryClient = useQueryClient();
  const activity = useTaskActivity(taskId);
  const comments = useTaskComments(taskId);
  const sender = useSendComment(taskId);
  const [segment, setSegment] = useState<FeedSegment>('all');
  const [editing, setEditing] = useState<TaskCommentView | null>(null);
  const [deleting, setDeleting] = useState<TaskCommentView | null>(null);

  const activityItems = useMemo(() => flattenPages(activity.data), [activity.data]);
  const commentItems = useMemo(() => flattenPages(comments.data), [comments.data]);
  const items = useMemo(
    () => mergeFeed(activityItems, commentItems, segment),
    [activityItems, commentItems, segment],
  );

  /** Tên theo userId — cho câu activity ("giao thẻ cho …") và chip nhắc tên chưa có nhãn ảnh chụp. */
  const names = useMemo(() => {
    const map = new Map<string, string>();
    detail?.assignees.forEach((person) => map.set(person.id, person.name));
    commentItems.forEach((comment) => {
      map.set(comment.author.id, comment.author.name);
      comment.mentions.forEach(
        (mention) => mention.label && map.set(mention.targetId, mention.label),
      );
    });
    activityItems.forEach((item) => item.actor && map.set(item.actor.id, item.actor.name));
    return map;
  }, [activityItems, commentItems, detail?.assignees]);

  const showsActivity = segment !== 'comments';
  const showsComments = segment !== 'activity';
  const source = [showsActivity ? activity : null, showsComments ? comments : null].filter(
    (query) => query !== null,
  );

  return {
    deleting,
    editing,
    hasMore: source.some((query) => query.hasNextPage),
    isError: source.some((query) => query.isError) && items.length === 0,
    isFetchingMore: source.some((query) => query.isFetchingNextPage),
    isLoading: source.some((query) => query.isLoading),
    items,
    names,
    segment,
    discard: (comment: TaskCommentView) =>
      queryClient.setQueryData<PagesData<TaskCommentView>>(taskKeys.comments(taskId), (data) =>
        removeComment(data, comment.id),
      ),
    loadMore: () =>
      source.forEach((query) => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }),
    refetch: () => {
      void activity.refetch();
      void comments.refetch();
    },
    retry: (comment: TaskCommentView) => {
      if (comment.localPayload)
        sender.mutate({ mentions: comment.mentions, payload: comment.localPayload });
    },
    setDeleting,
    setEditing,
    setSegment,
  };
}
