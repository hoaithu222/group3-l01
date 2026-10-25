import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { GanttTaskDto } from '../../api/critical-path.types';
import type { GanttStatus } from '../../utils/gantt-status';
import { formatDayIn } from '../../utils/zoned-date';
import { GanttStatusChip } from './GanttStatusChip';

export interface MilestoneRowProps {
  /** "Lan, Minh" hoặc "2 người làm" — dựng ở nơi gọi (cần cache). Rỗng = chưa giao. */
  assignees: string;
  statuses: readonly GanttStatus[];
  task: GanttTaskDto;
  timezone: string;
  onPress: (taskId: string) => void;
}

function MilestoneRowBase({ assignees, statuses, task, timezone, onPress }: MilestoneRowProps) {
  const start = formatDayIn(task.startDate, timezone);
  const due = formatDayIn(task.dueDate, timezone);
  const dates = [start ? `Bắt đầu ${start}` : null, due ? `Hạn ${due}` : null].filter(Boolean).join(' · ');
  const spoken = [
    task.title,
    dates,
    assignees ? `Người làm ${assignees}` : null,
    ...statuses.map((status) => status.label),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityHint="Mở chi tiết thẻ"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="min-h-[44px] gap-3xs rounded-xs border-hairline border-border-1 bg-bg-1 p-sm active:opacity-80"
      onPress={() => onPress(task.id)}
    >
      <Text className="text-label-md font-medium text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={3}>
        {task.title}
      </Text>
      {dates ? <Text className="text-caption-lg text-fg-2">{dates}</Text> : null}
      {assignees ? <Text className="text-caption-lg text-fg-2">{`Người làm: ${assignees}`}</Text> : null}
      {statuses.length > 0 ? (
        <View className="flex-row flex-wrap gap-xs pt-3xs">
          {statuses.map((status) => (
            <GanttStatusChip key={status.kind} kind={status.kind} label={status.label} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Một thẻ trong danh sách mốc của điện thoại (app.md §3 "Gantt (điện thoại)"): tiêu đề, ngày, người làm, chip trạng thái. */
export const MilestoneRow = memo(MilestoneRowBase);
