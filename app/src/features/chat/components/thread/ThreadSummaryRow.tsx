import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { MessageView, ResolveChatAuthor } from '../../api/chat.types';

export interface ThreadSummaryRowProps {
  message: Pick<MessageView, 'replyCount' | 'lastReplyAt' | 'lastReplierIds'>;
  resolveAuthor?: ResolveChatAuthor;
  onPress: () => void;
  /**
   * Số phản hồi CHƯA ĐỌC của luồng này (p1-06 app.md §3: chấm "N mới" khi `unreadReplies > 0`). Do MÀN CHA/nơi nối cấp
   * (`ThreadSummary` đọc `/me/unread`) — hàng này chỉ vẽ. Vắng/0 = không chấm.
   */
  unreadCount?: number;
}

/** BE chỉ trả tối đa 3 (`LIMITS.thread.lastRepliersMax`) — cắt thêm ở đây phòng payload lệch. */
const MAX_AVATARS = 3;

/**
 * "N phản hồi · 5 phút trước · avatar ≤ 3" dưới tin gốc (app.md p1-06 §3), chạm → mở màn luồng.
 *
 * Trả `null` khi `replyCount` VẮNG MẶT hoặc bằng 0: BE chỉ ghép tóm tắt cho tin gốc đã có luồng
 * (`undefined` KHÔNG có nghĩa "0 phản hồi" — có thể server chưa ghép), nên thiếu dữ liệu thì
 * ẩn cả hàng thay vì bịa số. Tin gốc đã thu hồi vẫn giữ hàng này (MSG-35: tombstone vẫn mở được luồng).
 *
 * Tên người trả lời chỉ đọc lên khi `resolveAuthor` có sẵn; không có thì chỉ đọc số phản hồi —
 * không bịa "Thành viên" cho từng avatar.
 */
export function ThreadSummaryRow({ message, resolveAuthor, onPress, unreadCount = 0 }: ThreadSummaryRowProps) {
  const count = message.replyCount ?? 0;
  if (count <= 0) return null;

  const repliers = (message.lastReplierIds ?? []).slice(0, MAX_AVATARS);
  const names = repliers
    .map((id) => resolveAuthor?.(id)?.name)
    .filter((name): name is string => Boolean(name));
  const when = message.lastReplyAt ? formatRelative(message.lastReplyAt) : '';
  // Chữ, không chỉ màu/chấm: "3 phản hồi mới" — BE chặn số đếm ở 100 nên hiện "99+" (cùng `Badge`).
  const unreadText = unreadCount > 99 ? '99+' : String(unreadCount);
  const unreadSpoken = unreadCount > 0 ? `, ${unreadText} phản hồi mới` : '';
  const spoken = `${count} phản hồi${names.length > 0 ? `, gần nhất từ ${names.join(', ')}` : ''}${when ? `, ${when}` : ''}${unreadSpoken}. Mở luồng trả lời`;

  return (
    <Pressable
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="mt-3xs min-h-11 flex-row items-center gap-xs rounded-xs px-2xs py-3xs"
      hitSlop={4}
      onPress={onPress}
    >
      {repliers.length > 0 ? (
        <View className="flex-row">
          {repliers.map((id, index) => {
            const author = resolveAuthor?.(id);
            return (
              <View key={id} className={index === 0 ? '' : '-ml-2'}>
                <Avatar
                  name={author?.name}
                  size="xs"
                  source={author?.avatarUrl ? { uri: author.avatarUrl } : undefined}
                />
              </View>
            );
          })}
        </View>
      ) : null}
      <Text className="text-label-sm font-semibold text-link">{count} phản hồi</Text>
      {when ? <Text className="text-caption-sm text-fg-2">· {when}</Text> : null}
      {unreadCount > 0 ? <Badge label={`${unreadText} mới`} size="sm" variant="brand" /> : null}
      {/* `fg-2` (≥ 3:1) — mũi tên là dấu hiệu "bấm được", `fg-3` chỉ 2.96:1. */}
      <Icon color="fg-2" name="arrow-right-small" size={16} />
    </Pressable>
  );
}
