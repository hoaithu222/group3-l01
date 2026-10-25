import { useMemo } from 'react';
import { SectionList, Text, View } from 'react-native';

import { SPACING } from '@/shared/theme';

import type { GanttDto } from '../../api/critical-path.types';
import { useTaskLookup } from '../../hooks/useTaskLookup';
import { buildPredecessorMap, ganttStatuses } from '../../utils/gantt-status';
import { groupByWeek } from '../../utils/milestone-groups';
import { MilestoneRow } from './MilestoneRow';

export interface MilestoneListProps {
  boardId: string;
  data: GanttDto;
  onOpenTask: (taskId: string) => void;
}

const ItemGap = () => <View style={{ height: SPACING.xs }} />;

/**
 * Danh sách mốc theo TUẦN cho điện thoại (app.md §3): cùng dữ liệu với biểu đồ tablet nhưng không tải SVG và không kéo
 * (§6) — quan hệ phụ thuộc đọc được qua chip "Bị chặn bởi A (chưa xong)". Mỗi thẻ vào tuần của hạn chót (không có hạn
 * thì ngày bắt đầu). Chạm một thẻ mở chi tiết, nơi có tấm ngày để đổi lịch.
 *
 * Dùng `SectionList` (ảo hoá sẵn): BE trả tối đa 2.000 thẻ, đủ nặng để `ScrollView` + `map` giật trên máy yếu.
 */
export function MilestoneList({ boardId, data, onOpenTask }: MilestoneListProps) {
  const { assigneesOf } = useTaskLookup(boardId);
  const timezone = data.timezone;

  const sections = useMemo(() => groupByWeek(data.tasks, timezone), [data.tasks, timezone]);
  const context = useMemo(
    () => ({
      predecessors: buildPredecessorMap(data.edges),
      tasksById: new Map(data.tasks.map((task) => [task.id, task])),
    }),
    [data.edges, data.tasks],
  );

  return (
    <SectionList
      contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING['3xl'] }}
      ItemSeparatorComponent={ItemGap}
      keyExtractor={(task) => task.id}
      renderItem={({ item }) => (
        <MilestoneRow
          assignees={
            assigneesOf(item.id, item.assigneeIds) ||
            (item.assigneeIds.length > 0 ? `${item.assigneeIds.length} người` : '')
          }
          statuses={ganttStatuses(item, context)}
          task={item}
          timezone={timezone}
          onPress={onOpenTask}
        />
      )}
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          className="bg-bg-base pb-3xs pt-xs text-label-lg font-semibold text-fg-1"
        >
          {section.isCurrent ? `${section.title} · Tuần này` : section.title}
        </Text>
      )}
      sections={sections}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
}
