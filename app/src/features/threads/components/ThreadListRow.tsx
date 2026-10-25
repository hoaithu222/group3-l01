import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { previewText, type ResolveChatAuthor } from '@/features/chat';
import { useThreadUnread } from '@/shared/notifications';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { ThreadView } from '../api';
import { useThreadByRoot } from '../queries/threads.queries';
import { isFollowing } from '../utils/thread-cache';

export interface ThreadListRowProps {
  thread: ThreadView;
  wsId: string;
  resolveAuthor: ResolveChatAuthor;
  /** Tab "Tất cả": đánh dấu luồng đang theo dõi (ở tab "Đang theo dõi" MỌI hàng đều theo dõi — dấu chỉ là nhiễu). */
  showFollowState: boolean;
  onOpen: (thread: ThreadView) => void;
}

/**
 * Một luồng trong "Danh sách luồng của kênh" (app.md p1-06): trích TIN GỐC (2 dòng) + tác giả, "N phản hồi · 5 phút trước", chấm "N mới" (số chưa đọc chuẩn của `/me/unread`), chạm mở màn luồng.
 *
 * BE (`ThreadView`) không mang nội dung tin gốc nên mỗi hàng tra riêng bằng `useThreadByRoot` — CÙNG khoá cache với màn luồng, nên mở luồng ngay sau đó không tải lại. Tin gốc chưa tải xong ⇒ khung xương
 * đúng dáng; tải lỗi ⇒ vẫn bấm mở được (màn luồng tự dựng trạng thái lỗi/thử lại của nó). Tin gốc đã THU HỒI vẫn mở được luồng (MSG-35). Tên tác giả chỉ hiện khi tra được — không bịa "Thành viên".
 */
export const ThreadListRow = memo(function ThreadListRow({ thread, wsId, resolveAuthor, showFollowState, onOpen }: ThreadListRowProps) {
  const rootQuery = useThreadByRoot(thread.parentMessageId);
  const unread = useThreadUnread(wsId, thread.id);
  const root = rootQuery.data?.root;
  const author = root?.authorId ? resolveAuthor(root.authorId) : undefined;
  const following = isFollowing(thread.mySubscription);
  const when = thread.lastReplyAt ? formatRelative(thread.lastReplyAt) : '';

  let preview = 'Không tải được tin gốc';
  if (root) preview = root.deleted ? 'Tin nhắn đã được thu hồi' : previewText(root, 160) || 'Tin nhắn';
  const unreadText = unread > 99 ? '99+' : String(unread);
  const spoken = [
    `${author ? `Tin gốc của ${author.name}` : 'Tin gốc'}: ${rootQuery.isPending ? 'đang tải' : preview}`,
    `${String(thread.replyCount)} phản hồi${when ? `, ${when}` : ''}`,
    unread > 0 ? `${unreadText} phản hồi mới` : '',
    showFollowState && following ? 'đang theo dõi' : '',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityHint="Mở luồng"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="min-h-16 flex-row items-start gap-sm border-b border-divider-1 px-md py-sm active:opacity-70"
      onPress={() => onOpen(thread)}
    >
      {author ? (
        <Avatar name={author.name} size="sm" source={author.avatarUrl ? { uri: author.avatarUrl } : undefined} />
      ) : (
        <IconTile name="chat-bubble" size="sm" />
      )}
      <View className="flex-1 gap-3xs">
        {author ? (
          <Text className="text-label-sm font-semibold text-fg-2" numberOfLines={1}>
            {author.name}
          </Text>
        ) : null}
        {rootQuery.isPending ? (
          <View className="gap-xs py-3xs">
            <Skeleton width="90%" />
            <Skeleton width="55%" />
          </View>
        ) : (
          <Text className={root && !root.deleted ? 'text-body-md text-fg-1' : 'text-body-md italic text-fg-2'} numberOfLines={2}>
            {preview}
          </Text>
        )}
        <View className="flex-row flex-wrap items-center gap-xs">
          <Text className="text-label-sm font-semibold text-link">{`${String(thread.replyCount)} phản hồi`}</Text>
          {when ? <Text className="text-caption-sm text-fg-2">{`· ${when}`}</Text> : null}
          {unread > 0 ? <Badge label={`${unreadText} mới`} size="sm" variant="brand" /> : null}
        </View>
      </View>
      {showFollowState && following ? <Icon color="fg-2" name="notification" size={16} /> : null}
      <Icon color="fg-2" name="arrow-right-small" size={16} />
    </Pressable>
  );
});
