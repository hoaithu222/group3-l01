import { Text, View } from 'react-native';

import { formatSpan } from '../../utils/clock';
import type { FocusDay } from './week-focus';

/** Ngày có tập trung luôn cao tối thiểu chừng này (%) — không biến mất cạnh ngày dài nhất. */
const MIN_BAR_PERCENT = 12;

function barPercent(seconds: number, max: number): number {
  return seconds > 0 ? Math.max(MIN_BAR_PERCENT, Math.round((seconds / max) * 100)) : 0;
}

function columnLabel(day: FocusDay): string {
  const when = day.isToday ? `Hôm nay, ${day.dateLabel}` : `${day.weekday}, ${day.dateLabel}`;
  return `${when}: ${day.seconds > 0 ? formatSpan(day.seconds) : 'chưa tập trung'}`;
}

/**
 * Mini-thanh 7 ngày (thời gian có mặt mỗi ngày) tự vẽ bằng `View`: thanh dâng từ đáy ô `h-12`, nhãn thứ ở dưới, hôm nay
 * đậm hơn. Không có số trên cột (cột hẹp, và tổng đã ở đầu thẻ) — số nằm trong nhãn trợ năng của từng cột. Chiều cao tính
 * theo ngày dài nhất; cả tuần 0 giây thì `max = 1` (không chia cho 0).
 */
export function HomeFocusBars({ days }: { days: readonly FocusDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.seconds));

  return (
    <View className="flex-row gap-xs">
      {days.map((day) => (
        <View
          key={day.key}
          accessibilityLabel={columnLabel(day)}
          accessible
          className="flex-1 items-center gap-2xs"
        >
          <View className="h-12 w-full justify-end overflow-hidden rounded-xs bg-bg-2">
            <View
              className={
                day.isToday
                  ? 'w-full rounded-xs bg-action-base'
                  : 'w-full rounded-xs bg-action-base/40'
              }
              style={{ height: `${barPercent(day.seconds, max)}%` }}
            />
          </View>
          <Text
            className={
              day.isToday ? 'text-caption-sm font-semibold text-fg-1' : 'text-caption-sm text-fg-2'
            }
          >
            {day.weekday}
          </Text>
        </View>
      ))}
    </View>
  );
}
