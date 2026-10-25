import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { TaskDetailDto } from '../../api/task-detail.types';
import { FEED_SEGMENTS, type FeedSegment } from '../../constants/task-detail.constants';
import { useOpenAttachment } from '../../hooks/useOpenAttachment';
import { useTaskLookup } from '../../hooks/useTaskLookup';
import { useTaskFeed } from '../../hooks/useTaskFeed';
import { useBoard } from '../../queries/boards.queries';
import { useDeleteComment } from '../../queries/task-comment-mutations.queries';
import { ActivityItem } from './ActivityItem';
import { CommentDeleteDialog } from './CommentDeleteDialog';
import { CommentEditSheet } from './CommentEditSheet';
import { CommentItem } from './CommentItem';

export interface ActivityFeedProps {
  boardId: string;
  currentUserId: string;
  detail: TaskDetailDto | undefined;
  isAdmin: boolean;
  taskId: string;
}

const EMPTY_COPY: Record<FeedSegment, string> = {
  activity: 'Chưa có hoạt động nào.',
  all: 'Chưa có trao đổi',
  comments: 'Chưa có bình luận',
};

/**
 * Luồng trao đổi của thẻ (app.md §2 `ActivityFeed`): "Tất cả · Hoạt động · Bình luận", mới nhất ở TRÊN.
 * Dựng bằng `View` + nút "Tải thêm" (trang 30) chứ không phải `FlashList`: luồng nằm TRONG vùng cuộn của
 * màn chi tiết — `FlashList` lồng `ScrollView` mất ảo hoá và báo cảnh báo; một thẻ hiếm khi quá vài trăm dòng.
 * Không bao giờ tự cuộn khi có bình luận mới (dòng mới chỉ xuất hiện ở đầu luồng): người đang đọc không bị giật.
 */
export function ActivityFeed({
  boardId,
  currentUserId,
  detail,
  isAdmin,
  taskId,
}: ActivityFeedProps) {
  const feed = useTaskFeed(taskId, detail);
  const remove = useDeleteComment(taskId);
  const opener = useOpenAttachment();
  const board = useBoard(boardId);
  const { titleOf } = useTaskLookup(boardId, taskId);
  const resolveName = (userId: string) => feed.names.get(userId);
  const resolveColumn = (columnId: string) =>
    board.data?.columns.find((column) => column.id === columnId)?.title;

  return (
    // Cùng khuôn tiêu đề `Section tone="default"` + icon với các khối khác của chi tiết thẻ (xem `ChecklistSection`).
    <Section icon="chat-bubble" title="Trao đổi" tone="default">
      <Tabs
        items={FEED_SEGMENTS.map((segment) => ({ key: segment.key, label: segment.label }))}
        scrollable
        value={feed.segment}
        onChange={(key) => {
          hapticSelection();
          feed.setSegment(key as FeedSegment);
        }}
      />

      {feed.isLoading ? (
        <View className="gap-xs pt-xs">
          <Skeleton className="h-10 rounded-xs" />
          <Skeleton className="h-10 rounded-xs" />
        </View>
      ) : feed.isError ? (
        <View className="items-start gap-xs pt-xs">
          <Text className="text-body-md text-fg-2">
            Không tải được luồng trao đổi. Kiểm tra kết nối rồi thử lại.
          </Text>
          <Button label="Thử lại" size="sm" variant="secondary" onPress={feed.refetch} />
        </View>
      ) : feed.items.length === 0 ? (
        // Rỗng: hình minh hoạ gọn (bình luận / lịch sử theo phân đoạn đang xem) thay cho một dòng chữ trơn giữa khối.
        <EmptyState
          description={EMPTY_COPY[feed.segment]}
          icon={feed.segment === 'activity' ? 'history' : 'chat-bubble'}
          size="compact"
        />
      ) : (
        feed.items.map((item) =>
          item.kind === 'activity' ? (
            <ActivityItem
              key={item.id}
              activity={item.activity}
              resolveColumn={resolveColumn}
              resolveName={resolveName}
              resolveTask={titleOf}
            />
          ) : (
            <CommentItem
              key={item.id}
              comment={item.comment}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              mentionLabel={(userId) => resolveName(userId) ?? 'người dùng'}
              onDelete={feed.setDeleting}
              onDiscard={feed.discard}
              onEdit={feed.setEditing}
              onOpenAttachment={(attachment) => void opener.open(attachment)}
              onRetry={feed.retry}
            />
          ),
        )
      )}

      {feed.hasMore ? (
        <Button
          label="Tải thêm"
          loading={feed.isFetchingMore}
          size="sm"
          variant="secondary"
          onPress={feed.loadMore}
        />
      ) : null}

      <CommentEditSheet
        boardId={boardId}
        comment={feed.editing}
        resolveName={resolveName}
        taskId={taskId}
        onClose={() => feed.setEditing(null)}
      />
      <CommentDeleteDialog
        comment={feed.deleting}
        currentUserId={currentUserId}
        onClose={() => feed.setDeleting(null)}
        onConfirm={(comment, reason) => remove.mutate({ commentId: comment.id, reason })}
      />
    </Section>
  );
}
