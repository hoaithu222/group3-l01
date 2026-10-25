import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime, formatRelative } from '@/shared/utils/format/date.utils';

import type { TaskActivityDto } from '../../api/task-detail.types';
import { activitySentence } from '../../utils/activity-text';

export interface ActivityItemProps {
  activity: TaskActivityDto;
  /** Tên cột theo `columnId` — BE chỉ ghi id ở activity `MOVED`. */
  resolveColumn?: (columnId: string) => string | undefined;
  resolveName: (userId: string) => string | undefined;
  /** Tiêu đề thẻ theo id — cho activity `DEPENDENCY_*`/`RESCHEDULED` (BE chỉ ghi id thẻ đầu kia). */
  resolveTask?: (taskId: string) => string | undefined;
}

/**
 * Một dòng nhật ký (app.md §2 `ActivityItem`): "Lan đã dời hạn chót sang 15/09/2026" + thời gian tương đối.
 * Hoạt động của HỆ THỐNG (`actor` rỗng — job dời lịch…) dùng icon thay avatar. Câu do `activity-text.ts` dựng
 * từ `type` + `before/after`; `accessibilityLabel` gộp cả giờ đầy đủ để trình đọc màn hình nói được mốc chính xác.
 */
export function ActivityItem({ activity, resolveColumn, resolveName, resolveTask }: ActivityItemProps) {
  const sentence = activitySentence(activity, resolveName, resolveColumn, resolveTask);

  return (
    <View
      accessibilityLabel={`${sentence}. ${formatDateTime(activity.at)}`}
      accessible
      className="min-h-[36px] flex-row items-start gap-xs py-2xs"
    >
      {activity.actor ? (
        <Avatar
          name={activity.actor.name}
          size="xs"
          source={activity.actor.avatarUrl ? { uri: activity.actor.avatarUrl } : undefined}
        />
      ) : (
        <View className="h-6 w-6 items-center justify-center rounded-full bg-bg-2">
          <Icon color="fg-2" name="setting" size={14} />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-body-md text-fg-1">{sentence}</Text>
        <Text className="text-caption-sm text-fg-2">{formatRelative(activity.at)}</Text>
      </View>
    </View>
  );
}
