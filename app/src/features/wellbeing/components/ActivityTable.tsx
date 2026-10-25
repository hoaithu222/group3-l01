import { Text, View } from 'react-native';

import {
  formatDayMonth,
  formatMinutes,
  weekdayLong,
  weekdayShort,
} from '../utils/wellbeing-format';
import type { DaySlot } from '../utils/wellbeing-series';

/**
 * BẢNG thay thế cho biểu đồ cột (app.md p7-03 §2: "có bảng thay thế cho biểu đồ") — cùng số liệu, từng ngày một dòng, MỚI → CŨ (đọc ngày gần nhất trước). Người dùng trình đọc màn hình
 * và người muốn xem số chính xác dùng bảng; mỗi dòng là MỘT phần tử trợ năng đọc trọn câu ("Thứ hai, 12/09: hoạt động 3 giờ, trong khung khuya 20 phút"). Ngày không có số liệu ghi
 * thẳng "Chưa có số liệu" (không phải "0 phút").
 */
function rowLabel(slot: DaySlot): string {
  const day = `${weekdayLong(slot.date)}, ${formatDayMonth(slot.date)}`;
  if (!slot.daily) return `${day}: chưa có số liệu`;
  return `${day}: hoạt động ${formatMinutes(slot.daily.activeMinutes)}, trong khung khuya ${formatMinutes(slot.daily.lateNightMinutes)}`;
}

export function ActivityTable({ slots }: { slots: readonly DaySlot[] }) {
  const rows = [...slots].reverse();
  return (
    <View>
      <View className="flex-row gap-sm border-b border-border-1 pb-xs">
        <Text className="flex-1 text-label-sm font-semibold text-fg-2">Ngày</Text>
        <Text className="flex-1 text-label-sm font-semibold text-fg-2">Hoạt động</Text>
        <Text className="flex-1 text-label-sm font-semibold text-fg-2">Khung khuya</Text>
      </View>
      {rows.map((slot) => (
        <View
          key={slot.date}
          accessibilityLabel={rowLabel(slot)}
          accessible
          className="flex-row items-center gap-sm border-b border-border-1 py-xs"
        >
          <Text className="flex-1 text-body-md text-fg-1">
            {`${weekdayShort(slot.date)} ${formatDayMonth(slot.date)}`}
          </Text>
          <Text className="flex-1 text-body-md text-fg-1">
            {slot.daily ? formatMinutes(slot.daily.activeMinutes) : 'Chưa có số liệu'}
          </Text>
          <Text className="flex-1 text-body-md text-fg-1">
            {slot.daily ? formatMinutes(slot.daily.lateNightMinutes) : '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}
