import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { GANTT_AXIS_HEIGHT } from '../../constants/critical-path.constants';
import type { Timeline } from '../../utils/gantt-layout';
import { dayParts } from '../../utils/zoned-date';

/** Từ 36dp/ngày trở lên mới đủ chỗ ghi số của MỖI ngày; hẹp hơn chỉ ghi ngày đầu tuần (thứ Hai). */
const MIN_WIDTH_FOR_EVERY_DAY = 36;
/** Từ 56dp/ngày mới đủ chỗ thêm chữ cái thứ (T2…CN) dưới số ngày. */
const MIN_WIDTH_FOR_WEEKDAY = 56;
const WEEKDAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export interface GanttTimeAxisProps {
  timeline: Timeline;
  /** Thứ tự cột của hôm nay; `null` khi hôm nay nằm ngoài khoảng đang xem. */
  todayIndex: number | null;
}

/**
 * Trục ngày phía trên biểu đồ (app.md §2 `GanttTimeAxis`): hàng trên là THÁNG (ghi ở ngày mùng 1 và ngày đầu khoảng),
 * hàng dưới là NGÀY — số ngày (kèm thứ khi đủ rộng), cuối tuần tô nền nhạt, hôm nay tô đậm hơn. Mọi nhãn chỉ để NHÌN: trình đọc màn hình đọc qua danh sách mốc.
 */
export function GanttTimeAxis({ timeline, todayIndex }: GanttTimeAxisProps) {
  const cells = useMemo(
    () =>
      Array.from({ length: timeline.days }, (_, index) => {
        const day = timeline.fromDay + index;
        return { ...dayParts(day), day, index };
      }),
    [timeline.days, timeline.fromDay],
  );
  const every = timeline.dayWidth >= MIN_WIDTH_FOR_EVERY_DAY;
  const withWeekday = timeline.dayWidth >= MIN_WIDTH_FOR_WEEKDAY;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: GANTT_AXIS_HEIGHT, width: timeline.width }}
    >
      {cells.map((cell) =>
        cell.date === 1 || cell.index === 0 ? (
          <Text
            key={`m${cell.day}`}
            className="absolute text-label-sm font-semibold text-fg-1"
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ left: cell.index * timeline.dayWidth + 4, top: 0 }}
          >
            {`Tháng ${String(cell.month).padStart(2, '0')}/${cell.year}`}
          </Text>
        ) : null,
      )}
      <View className="absolute bottom-0 left-0 right-0 flex-row" style={{ height: GANTT_AXIS_HEIGHT / 2 + 4 }}>
        {cells.map((cell) => {
          const label = every || cell.weekday === 0 ? String(cell.date) : '';
          return (
            <View
              key={cell.day}
              className={
                cell.index === todayIndex
                  ? 'items-center justify-center bg-action-tint-strong'
                  : cell.weekday >= 5
                    ? 'items-center justify-center bg-bg-2'
                    : 'items-center justify-center'
              }
              style={{ width: timeline.dayWidth }}
            >
              <Text
                className="text-caption-sm text-fg-1"
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {label}
              </Text>
              {withWeekday ? (
                <Text className="text-caption-sm text-fg-2" maxFontSizeMultiplier={1.3} numberOfLines={1}>
                  {WEEKDAY[cell.weekday]}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
