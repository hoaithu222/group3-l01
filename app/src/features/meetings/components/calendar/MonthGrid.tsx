import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { WEEKDAY_SHORT } from '../../constants/meetings.constants';
import { monthGridDays, isSameMonth, monthTitle } from '../../utils/meeting-month.utils';
import { toDayKey } from '../../utils/meeting-time.utils';
import { MonthDayCell } from './MonthDayCell';

export interface MonthGridProps {
  /** Số cuộc họp mỗi ngày, khoá `YYYY-MM-DD` (giờ máy). */
  counts: ReadonlyMap<string, number>;
  /** Ngày đang chọn — quyết định luôn TUẦN/THÁNG đang xem. */
  selected: Date;
  onSelect: (date: Date) => void;
  /** −1 tháng trước, +1 tháng sau. */
  onShiftMonth: (deltaMonths: number) => void;
  onToday: () => void;
}

/**
 * Lưới lịch THÁNG cho máy tính bảng (app.md p2-04 §3 `MonthGrid`): tuần bắt đầu thứ hai, chấm báo ngày có họp, mũi tên đổi tháng,
 * "Hôm nay".
 *
 * ⚠️ Viết cục bộ vì `Calendar` của bộ chung KHÔNG làm được ba việc ở đây: (1) vẽ chấm/số họp theo ngày, (2) báo ra ngoài khi đổi
 * THÁNG để màn tải đúng cửa sổ dữ liệu (nó tự giữ tháng đang xem, `onChange` chỉ bắn khi chọn ngày), (3) tô ngày theo cửa sổ
 * dữ liệu chứ không theo min/max. Cần ở feature thứ hai thì nâng lên `shared/ui/date-picker`.
 */
export function MonthGrid({ counts, onSelect, onShiftMonth, onToday, selected }: MonthGridProps) {
  const days = monthGridDays(selected);
  const todayKey = toDayKey(new Date());
  const selectedKey = toDayKey(selected);
  const rows = Array.from({ length: days.length / 7 }, (_, row) =>
    days.slice(row * 7, row * 7 + 7),
  );

  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-xs">
        <Button
          accessibilityLabel="Tháng trước"
          iconLeft="arrow-left-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onShiftMonth(-1)}
        />
        <Text accessibilityRole="header" className="flex-1 text-center text-label-lg text-fg-1">
          {monthTitle(selected)}
        </Text>
        <Button label="Hôm nay" size="sm" variant="secondary" onPress={onToday} />
        <Button
          accessibilityLabel="Tháng sau"
          iconLeft="arrow-right-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onShiftMonth(1)}
        />
      </View>
      <View className="flex-row">
        {WEEKDAY_SHORT.map((label) => (
          <Text key={label} className="flex-1 text-center text-caption-sm text-fg-2">
            {label}
          </Text>
        ))}
      </View>
      {rows.map((week) => (
        <View key={toDayKey(week[0] ?? selected)} className="flex-row">
          {week.map((date) => {
            const key = toDayKey(date);
            return (
              <MonthDayCell
                key={key}
                count={counts.get(key) ?? 0}
                date={date}
                inMonth={isSameMonth(date, selected)}
                selected={key === selectedKey}
                today={key === todayKey}
                onPress={onSelect}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
