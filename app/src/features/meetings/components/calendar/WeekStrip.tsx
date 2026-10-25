import { Text, View } from 'react-native';

import { useNow } from '@/shared/hooks/useNow';
import { Button } from '@/shared/ui/button';

import { WEEKDAY_SHORT } from '../../constants/meetings.constants';
import { monthTitle } from '../../utils/meeting-month.utils';
import { addDays, toDayKey } from '../../utils/meeting-time.utils';
import { WeekDayCell } from './WeekDayCell';

export interface WeekStripProps {
  /** Ngày (`YYYY-MM-DD`, giờ máy) có ≥ 1 cuộc họp — vẽ chấm dưới số ngày. */
  busyDays: ReadonlySet<string>;
  onSelect: (date: Date) => void;
  /** Đổi tuần: −1 tuần trước, +1 tuần sau (giữ nguyên thứ trong tuần của ngày đang chọn). */
  onShiftWeek: (deltaWeeks: number) => void;
  selected: Date;
  weekStart: Date;
}

/**
 * Dải tuần (điện thoại, app.md p2-04 §3): hàng đầu "Tháng 9/2026" + "Hôm nay" + mũi tên tuần trước/sau, dưới là 7 ô ngày T2→CN
 * (`WeekDayCell`). Nút mũi tên thay cho vuốt ngang: vuốt dễ nhầm với cuộn dọc danh sách bên dưới.
 *
 * Bố cục cũ đặt hai mũi tên hai đầu HÀNG NGÀY: 80dp bề ngang bị ăn mất nên 7 ô bị ép sát vào mũi tên, và cả dải không nói đang ở
 * tháng nào (28 29 30 1 2 3 4 — tuần vắt qua hai tháng là mất phương hướng). Dồn điều hướng lên hàng tiêu đề trả lại trọn bề ngang
 * cho 7 ô. "Hôm nay" chỉ hiện khi đã rời hôm nay — đang ở hôm nay thì nút đó không làm gì.
 */
export function WeekStrip({
  busyDays,
  onSelect,
  onShiftWeek,
  selected,
  weekStart,
}: WeekStripProps) {
  // "Hôm nay" đọc từ STATE (`useNow`), ⛔ không `new Date()` trong thân render: React Compiler ghi nhớ nó ⇒ qua nửa đêm ô
  // "hôm nay" vẫn đứng ở ngày cũ cho tới khi màn được dựng lại.
  const now = useNow();
  const todayKey = toDayKey(new Date(now));
  const selectedKey = toDayKey(selected);

  return (
    <View className="gap-2xs px-md pb-xs">
      <View className="flex-row items-center gap-xs">
        <Text
          accessibilityRole="header"
          className="flex-1 text-label-lg font-semibold text-fg-1"
          numberOfLines={1}
        >
          {monthTitle(selected)}
        </Text>
        {selectedKey === todayKey ? null : (
          <Button
            label="Hôm nay"
            size="sm"
            variant="secondary"
            onPress={() => onSelect(new Date())}
          />
        )}
        <Button
          accessibilityLabel="Tuần trước"
          iconLeft="arrow-left-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onShiftWeek(-1)}
        />
        <Button
          accessibilityLabel="Tuần sau"
          iconLeft="arrow-right-small"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onShiftWeek(1)}
        />
      </View>
      <View className="flex-row">
        {WEEKDAY_SHORT.map((label, index) => {
          const date = addDays(weekStart, index);
          const key = toDayKey(date);
          return (
            <WeekDayCell
              key={key}
              busy={busyDays.has(key)}
              date={date}
              label={label}
              selected={key === selectedKey}
              today={key === todayKey}
              onPress={onSelect}
            />
          );
        })}
      </View>
    </View>
  );
}
