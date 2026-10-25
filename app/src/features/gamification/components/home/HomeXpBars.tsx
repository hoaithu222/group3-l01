import { Text, View } from 'react-native';

import { formatXpCompact } from '../../utils/xp-week';
import type { DayBucket } from '../../utils/xp-week.types';

/** Cột có XP luôn cao tối thiểu chừng này (%) — ngày ít XP vẫn thấy được một thanh thay vì biến mất cạnh ngày kỷ lục. */
const MIN_BAR_PERCENT = 10;

function barPercent(xp: number, max: number): number {
  return xp > 0 ? Math.max(MIN_BAR_PERCENT, Math.round((xp / max) * 100)) : 0;
}

function columnLabel(day: DayBucket): string {
  const when = day.isToday ? `Hôm nay, ${day.dateLabel}` : `${day.weekday}, ${day.dateLabel}`;
  return `${when}: ${day.xp} XP`;
}

/**
 * Biểu đồ cột 7 ngày (XP mỗi ngày) tự vẽ bằng `View` — không thêm thư viện chart. Mỗi cột: số gọn ở trên (chỉ ngày có
 * XP), thanh dâng từ đáy ô, nhãn thứ ở dưới. Hôm nay là cột đậm (`action-base`), các ngày trước nhạt hơn cùng tông.
 * Chiều cao cột tính theo NGÀY LỚN NHẤT của tuần; cả tuần 0 XP thì `max = 1` để không chia cho 0.
 *
 * ⚠️ Chiều cao theo `%` chỉ chạy khi cha có chiều cao xác định — ô `h-20` bên dưới. Mỗi cột là một ô trợ năng có câu
 * "T3, 22/09: 120 XP" (con số không chỉ nằm ở hình).
 */
export function HomeXpBars({ days }: { days: readonly DayBucket[] }) {
  const max = Math.max(1, ...days.map((day) => day.xp));

  return (
    <View className="flex-row gap-xs">
      {days.map((day) => (
        <View
          key={day.dateKey}
          accessibilityLabel={columnLabel(day)}
          accessible
          className="flex-1 items-center gap-2xs"
        >
          <View className="h-4 justify-center">
            {day.xp > 0 ? (
              <Text
                className={
                  day.isToday
                    ? 'text-caption-sm font-semibold text-fg-1'
                    : 'text-caption-sm text-fg-2'
                }
              >
                {formatXpCompact(day.xp)}
              </Text>
            ) : null}
          </View>
          <View className="h-20 w-full justify-end overflow-hidden rounded-xs bg-bg-2">
            <View
              className={
                day.isToday
                  ? 'w-full rounded-xs bg-action-base'
                  : 'w-full rounded-xs bg-action-base/40'
              }
              style={{ height: `${barPercent(day.xp, max)}%` }}
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
