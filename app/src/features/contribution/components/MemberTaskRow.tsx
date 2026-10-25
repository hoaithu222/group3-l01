import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';

import type { MemberTaskItem } from '../api/contribution.types';
import { formatDecimal, formatPoints } from '../utils/contribution-format';
import { formatDateIn } from '../utils/zoned-format';

export interface MemberTaskRowProps {
  task: MemberTaskItem;
  /** Múi giờ của nhóm — ngày hạn/ngày xong hiện theo đó, không theo giờ máy. */
  timezone: string;
}

/** "3 điểm · chia 2 người · chưa gán điểm thẻ" — điểm CỦA NGƯỜI NÀY (đã chia đều), kèm lý do khi khác điểm thẻ gốc. */
function pointsText(task: MemberTaskItem): string {
  const parts = [`${formatPoints(task.sharedPoints)} điểm`];
  if (task.assigneeCount > 1) parts.push(`chia ${task.assigneeCount} người`);
  if (task.storyPoints === null) parts.push('chưa gán điểm thẻ');
  return parts.join(' · ');
}

function deadlineBadge(onTime: boolean | null): { label: string; variant: 'neutral' | 'success' | 'warning' } {
  if (onTime === null) return { label: 'Không có hạn', variant: 'neutral' };
  return onTime ? { label: 'Đúng hạn', variant: 'success' } : { label: 'Trễ hạn', variant: 'warning' };
}

/**
 * Một thẻ được tính cho thành viên (app.md §3 `MemberBreakdownSheet`): tiêu đề (hoặc "(đã xoá)" — server không trả lại tiêu đề thẻ đã xoá),
 * điểm được chia, hạn/ngày xong, đúng hay trễ hạn (CHỮ, không chỉ màu) và điểm chấm. Mỗi điểm đều truy được về thẻ gốc — đó là phần "minh bạch"
 * của bảng đóng góp.
 */
export function MemberTaskRow({ task, timezone }: MemberTaskRowProps) {
  const badge = deadlineBadge(task.onTime);
  const due = task.dueDate ? `Hạn ${formatDateIn(task.dueDate, timezone)} · ` : '';

  return (
    <View className="gap-3xs border-b border-hairline border-divider-1 py-sm">
      <View className="flex-row items-start justify-between gap-xs">
        <Text
          className={task.deleted ? 'flex-1 text-body-lg italic text-fg-2' : 'flex-1 text-body-lg font-semibold text-fg-1'}
          numberOfLines={2}
        >
          {task.deleted ? '(đã xoá)' : (task.title ?? '')}
        </Text>
        <Badge label={badge.label} size="sm" variant={badge.variant} />
      </View>
      <Text className="text-body-md text-fg-2">{pointsText(task)}</Text>
      <Text className="text-caption-sm text-fg-2">{`${due}Xong ${formatDateIn(task.completedAt, timezone)}`}</Text>
      <Text className="text-caption-sm text-fg-2">
        {task.reviewScoreAvg === null
          ? 'Chưa có lượt chấm'
          : `Điểm chấm ${formatDecimal(task.reviewScoreAvg)} (${task.reviewCount} lượt)`}
      </Text>
    </View>
  );
}
