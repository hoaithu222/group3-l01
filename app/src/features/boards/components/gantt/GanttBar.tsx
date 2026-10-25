import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { GanttTaskDto } from '../../api/critical-path.types';
import {
  GANTT_BAR_HEIGHT,
  GANTT_LABEL_HEIGHT,
  GANTT_ROW_HEIGHT,
} from '../../constants/critical-path.constants';
import { useGanttBarGestures } from '../../hooks/useGanttBarGestures';
import type { BarGeometry } from '../../utils/gantt-layout';
import type { GanttDragMode } from '../../utils/gantt-shift';
import type { GanttStatus } from '../../utils/gantt-status';
import { formatDayIn } from '../../utils/zoned-date';

/** Nền thanh theo trạng thái — ưu tiên xung đột > đường găng > đã xong. Màu chỉ TÔ THÊM; nghĩa nằm ở chữ và icon. */
const FILL = {
  conflict: 'bg-action-warning',
  critical: 'bg-action-error',
  done: 'bg-action-success',
  normal: 'bg-action-info',
} as const;

const ICON_TONE = {
  conflict: 'action-warning-fg',
  critical: 'action-error-fg',
  done: 'action-success-fg',
  normal: 'action-info-fg',
} as const;

/** Tay nắm kéo mép phải: chỉ có khi thanh đủ rộng để vừa tay nắm mà vẫn còn chỗ bấm thân thanh. */
const HANDLE_WIDTH = 16;
const MIN_WIDTH_FOR_HANDLE = 40;
const MIN_TOUCH = 44;
const LABEL_MAX_WIDTH = 240;

export interface GanttBarProps {
  canDrag: boolean;
  dayWidth: number;
  geometry: BarGeometry;
  statuses: readonly GanttStatus[];
  task: GanttTaskDto;
  timezone: string;
  onPress: (task: GanttTaskDto) => void;
  onShift: (task: GanttTaskDto, mode: GanttDragMode, days: number) => void;
}

function GanttBarBase({
  canDrag,
  dayWidth,
  geometry,
  statuses,
  task,
  timezone,
  onPress,
  onShift,
}: GanttBarProps) {
  const { animatedStyle, move, resize } = useGanttBarGestures({
    dayWidth,
    enabled: canDrag,
    maxShrinkDays: Math.max(0, Math.round(geometry.width / dayWidth) - 1),
    width: geometry.width,
    onCommit: (mode, days) => onShift(task, mode, days),
  });

  const variant = task.conflict ? 'conflict' : task.isCritical ? 'critical' : task.columnKind === 'DONE' ? 'done' : 'normal';
  const start = formatDayIn(task.startDate, timezone);
  const due = formatDayIn(task.dueDate, timezone);
  const suffix = statuses
    .filter((status) => status.kind === 'conflict' || status.kind === 'critical')
    .map((status) => ` · ${status.label}`)
    .join('');
  const spoken = [
    task.title,
    [start ? `Bắt đầu ${start}` : null, due ? `Hạn ${due}` : null].filter(Boolean).join(', '),
    ...statuses.map((status) => status.label),
  ]
    .filter(Boolean)
    .join('. ');
  const slack = Math.max(0, (MIN_TOUCH - geometry.width) / 2);

  return (
    <View
      pointerEvents="box-none"
      style={{
        height: GANTT_ROW_HEIGHT,
        left: geometry.x,
        position: 'absolute',
        top: geometry.y,
        width: Math.max(geometry.width, LABEL_MAX_WIDTH),
      }}
    >
      {/* Dòng tên chỉ để NHÌN — thanh bên dưới đã mang đủ nhãn trợ năng, đọc hai lần là thừa. */}
      <View
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ height: GANTT_LABEL_HEIGHT, width: LABEL_MAX_WIDTH }}
      >
        <Text
          className="text-caption-sm text-fg-1"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {`${task.title}${suffix}`}
        </Text>
      </View>

      <GestureDetector gesture={move}>
        <Animated.View cssInterop={false} style={[{ height: GANTT_BAR_HEIGHT, left: 0, position: 'absolute', top: GANTT_LABEL_HEIGHT }, animatedStyle]}>
          <Pressable
            accessibilityHint={canDrag ? 'Chạm để đổi ngày của thẻ. Giữ rồi kéo để dời lịch.' : 'Chạm để mở thẻ'}
            accessibilityLabel={spoken}
            accessibilityRole="button"
            className="flex-1"
            hitSlop={{ bottom: 8, left: slack, right: slack, top: 8 }}
            onPress={() => onPress(task)}
          >
            <View className={cn('flex-1 flex-row items-center rounded-2xs px-2xs', FILL[variant])}>
              {variant === 'normal' ? null : (
                <Icon
                  color={ICON_TONE[variant]}
                  name={variant === 'conflict' ? 'alert-warning' : variant === 'critical' ? 'flash' : 'checkmark-circle'}
                  size={14}
                />
              )}
            </View>
          </Pressable>
          {canDrag && geometry.width >= MIN_WIDTH_FOR_HANDLE ? (
            <GestureDetector gesture={resize}>
              <View
                accessibilityElementsHidden
                className="absolute bottom-0 right-0 top-0 items-center justify-center"
                importantForAccessibility="no-hide-descendants"
                style={{ width: HANDLE_WIDTH }}
              >
                <View className="h-3 w-3xs rounded-full bg-fg-inverse" />
              </View>
            </GestureDetector>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Thanh của một thẻ (app.md §2 `GanttBar`): tên thẻ ở TRÊN thanh; chạm mở tấm ngày; nhấn giữ rồi kéo cả thanh (đổi cả hai
 * ngày) hoặc kéo tay nắm mép phải (đổi hạn chót). Mỗi thao tác kéo đều CÓ đường thay thế bằng chạm (§7) nên nút không
 * phụ thuộc cử chỉ. Thanh cao 28dp nhưng vùng bấm nới tới ≥ 44dp bằng `hitSlop` (thanh một ngày rộng chỉ 20–56dp).
 * Trạng thái nói bằng chữ + icon (hậu tố tên thẻ, nhãn trợ năng), màu nền chỉ là phụ.
 */
export const GanttBar = memo(GanttBarBase);
