import { useMemo, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';

import { BORDER_WIDTH } from '@/shared/theme';

import type { GanttDto, GanttTaskDto } from '../../api/critical-path.types';
import {
  GANTT_BAR_HEIGHT,
  GANTT_DAY_WIDTH,
  GANTT_LABEL_HEIGHT,
  GANTT_ROW_HEIGHT,
  GANTT_ROW_OVERSCAN,
  type GanttRangeKey,
} from '../../constants/critical-path.constants';
import { useVisibleRows } from '../../hooks/useVisibleRows';
import { barRect, visibleEdges } from '../../utils/gantt-arrows';
import { barGeometry, buildTimeline, indexOfDay, sortGanttTasks } from '../../utils/gantt-layout';
import type { GanttDragMode } from '../../utils/gantt-shift';
import { buildPredecessorMap, ganttStatuses } from '../../utils/gantt-status';
import { todayNumberIn } from '../../utils/zoned-date';
import { GanttArrows } from './GanttArrows';
import { GanttBar } from './GanttBar';
import { GanttTimeAxis } from './GanttTimeAxis';

export interface GanttChartProps {
  /** Có quyền và đang online — tắt thì thanh chỉ chạm được, không kéo được. */
  canDrag: boolean;
  /** id cột theo thứ tự của bảng — hàng nhóm theo cột (thiếu ⇒ chỉ theo ngày). */
  columnOrder?: readonly string[];
  data: GanttDto;
  rangeKey: GanttRangeKey;
  onOpenBar: (task: GanttTaskDto) => void;
  onShift: (task: GanttTaskDto, mode: GanttDragMode, days: number) => void;
}

/**
 * Biểu đồ Gantt cho TABLET (app.md §2 `GanttChart`): `ScrollView` hai chiều — ngang cho trục ngày, dọc cho hàng — với
 * trục ngày đứng yên khi cuộn dọc (nằm NGOÀI `ScrollView` dọc, trong `ScrollView` ngang nên vẫn cuộn ngang cùng thanh).
 * Hàng ảo hoá theo vùng nhìn thấy (`useVisibleRows`): BE trả tới 2.000 thẻ, chỉ vẽ ~vài chục thanh mỗi lúc.
 *
 * Mỗi thẻ một hàng, nhóm theo cột rồi sắp theo ngày bắt đầu. Mũi tên chỉ vẽ cho cạnh có đầu trong dải đang vẽ; toạ độ đầu kia lấy từ
 * hình học của TOÀN BỘ hàng (tính một lần) nên mũi tên đi tới thanh nằm ngoài màn vẫn đúng.
 */
export function GanttChart({ canDrag, columnOrder, data, rangeKey, onOpenBar, onShift }: GanttChartProps) {
  const timezone = data.timezone;
  const dayWidth = GANTT_DAY_WIDTH[rangeKey];
  const rows = useMemo(() => sortGanttTasks(data.tasks, columnOrder), [columnOrder, data.tasks]);
  const timeline = useMemo(
    () => buildTimeline({ from: data.from, to: data.to }, timezone, dayWidth),
    [data.from, data.to, dayWidth, timezone],
  );
  const geometries = useMemo(
    () =>
      rows.map((task, index) =>
        barGeometry(task, timeline, timezone, { height: GANTT_ROW_HEIGHT, index }),
      ),
    [rows, timeline, timezone],
  );
  const rowIndexOf = useMemo(() => new Map(rows.map((task, index) => [task.id, index])), [rows]);
  const context = useMemo(
    () => ({
      predecessors: buildPredecessorMap(data.edges),
      tasksById: new Map(data.tasks.map((task) => [task.id, task])),
    }),
    [data.edges, data.tasks],
  );
  const todayIndex = useMemo(() => {
    const index = indexOfDay(timeline, todayNumberIn(timezone));
    return index >= 0 && index < timeline.days ? index : null;
  }, [timeline, timezone]);

  const { onLayout, onScroll, range } = useVisibleRows(rows.length, GANTT_ROW_HEIGHT, GANTT_ROW_OVERSCAN);
  const edges = visibleEdges(data.edges, rowIndexOf, range);
  const rectOf = (taskId: string) => {
    const geometry = geometries[rowIndexOf.get(taskId) ?? -1];
    return geometry ? barRect(geometry, GANTT_LABEL_HEIGHT, GANTT_BAR_HEIGHT) : undefined;
  };

  const height = rows.length * GANTT_ROW_HEIGHT;
  const bars: ReactElement[] = [];
  for (let index = range.first; index <= range.last; index += 1) {
    const geometry = geometries[index];
    const task = rows[index];
    if (!geometry || !task) continue;
    bars.push(
      <GanttBar
        key={task.id}
        canDrag={canDrag && task.dueDate !== null}
        dayWidth={dayWidth}
        geometry={geometry}
        statuses={ganttStatuses(task, context)}
        task={task}
        timezone={timezone}
        onPress={onOpenBar}
        onShift={onShift}
      />,
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      <View style={{ width: timeline.width }}>
        <GanttTimeAxis timeline={timeline} todayIndex={todayIndex} />
        <ScrollView
          scrollEventThrottle={32}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          onLayout={onLayout}
          onScroll={onScroll}
        >
          <View style={{ height, width: timeline.width }}>
            {todayIndex === null ? null : (
              <View
                accessibilityElementsHidden
                className="absolute bottom-0 top-0 bg-action-accent"
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={{
                  left: todayIndex * dayWidth + dayWidth / 2 - BORDER_WIDTH.medium / 2,
                  width: BORDER_WIDTH.medium,
                }}
              />
            )}
            <GanttArrows edges={edges} height={height} rectOf={rectOf} width={timeline.width} />
            {bars}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}
