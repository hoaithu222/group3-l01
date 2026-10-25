import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { InboxItem } from '@/core/notifications';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatRelative } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import { activityIconFor, activityToneFor } from '../utils/activity-icon';
import { describeActivity } from '../utils/describe-item';
import { isInboxItemUnavailable } from '../utils/inbox-target';

export interface ActivityItemProps {
  item: InboxItem;
  /** Tên nhóm theo id — cho câu của mục nhóm mà BE chỉ kèm id (xem `useActivityScreen`). */
  workspaceNames?: ReadonlyMap<string, string>;
  onPress: (item: InboxItem) => void;
}

function buildAccessibilityLabel(
  description: ReturnType<typeof describeActivity>,
  time: string,
  unread: boolean,
  muted: boolean,
): string {
  const parts = [description.title];
  if (description.excerpt) parts.push(description.excerpt);
  parts.push(time);
  if (muted) parts.push('đã tắt tiếng');
  if (unread) parts.push('chưa đọc');
  return parts.join('. ');
}

/**
 * Một mục hộp thư "Hoạt động" (p1-07 `app.md` §3): người thực hiện · câu mô tả theo `type` · trích đoạn · thời gian ·
 * chấm chưa đọc · nhãn "Đã tắt tiếng". Chạm → đánh dấu đọc + mở đúng chỗ (việc của màn cha).
 *
 * Mục MẤT QUYỀN vẫn bấm được (để đánh dấu đã đọc và báo trung tính) nhưng chỉ hiện "Nội dung không còn khả dụng" — không
 * tên người/kênh/nhóm cũ (UX riêng §7). Chưa đọc KHÔNG chỉ bằng màu: chữ đậm + chấm + nhãn trợ năng "chưa đọc".
 */
export const ActivityItem = memo(function ActivityItem({
  item,
  onPress,
  workspaceNames,
}: ActivityItemProps) {
  const unavailable = isInboxItemUnavailable(item);
  const description = describeActivity(item, { workspaceNames });
  const actorName = item.actor?.name?.trim();
  // URL tuyệt đối BE ký sẵn: dùng nguyên chuỗi (không ghép base URL, không Bearer). Ảnh lỗi ⇒ `Avatar` lùi về chữ viết tắt.
  const actorAvatarUrl = item.actor?.avatarUrl;
  const unread = item.readAt === null;
  const time = formatRelative(item.createdAt);
  const muted = item.muted || item.context?.muted === true;

  return (
    <Pressable
      accessibilityHint={unavailable ? undefined : 'Mở nội dung'}
      accessibilityLabel={buildAccessibilityLabel(description, time, unread, muted)}
      accessibilityRole="button"
      className="flex-row items-start gap-sm px-md py-sm active:opacity-70"
      onPress={() => onPress(item)}
    >
      {unavailable ? (
        <IconTile name="hide" tone="neutral" />
      ) : actorName ? (
        <Avatar
          name={actorName}
          size="md"
          source={actorAvatarUrl ? { uri: actorAvatarUrl } : undefined}
        />
      ) : (
        // KHÔNG có người thực hiện (thẻ/nhóm/họp/ví… — BE chỉ điền `actor` cho tin nhắn) ⇒ ô icon theo LOẠI (icon + tông
        // theo họ sự kiện), không phải "?".
        <IconTile name={activityIconFor(item.type)} tone={activityToneFor(item.type)} />
      )}

      <View className="flex-1 gap-3xs">
        <Text
          className={cn('text-body-md', unread ? 'font-semibold text-fg-1' : 'text-fg-2')}
          numberOfLines={2}
        >
          {description.title}
        </Text>
        {description.excerpt ? (
          <Text className="text-caption-sm text-fg-2" numberOfLines={2}>
            {description.excerpt}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2xs">
          <Text className="text-caption-sm text-fg-2">{time}</Text>
          {muted ? (
            <View className="flex-row items-center gap-3xs">
              {/* `fg-2` (không `fg-4` — 1.73:1, gần như vô hình): icon đi cùng chữ nhưng vẫn phải nhìn thấy được. */}
              <Icon color="fg-2" name="noti-off" size={12} />
              <Text className="text-caption-sm text-fg-2">Đã tắt tiếng</Text>
            </View>
          ) : null}
        </View>
      </View>

      {unread ? <Badge accessibilityLabel="Chưa đọc" dot /> : null}
    </Pressable>
  );
});
