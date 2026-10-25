import { View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { hapticSelection } from '@/shared/utils/haptics';

import { ROADMAP_WEEKDAYS } from '../../constants/roadmap.constants';

export interface StudyDaysPickerProps {
  value: readonly number[];
  onChange: (days: number[]) => void;
}

/**
 * 7 nút thứ trong tuần (app.md §3 `EnrollSheet`) — `1` Thứ 2 … `7` Chủ nhật (be.md §2 `defaultStudyDays`). Mỗi lần bật/tắt một
 * thứ rung nhẹ kiểu "đổi lựa chọn" (`hapticSelection`) — xác nhận cú chạm trên chip nhỏ, lịch xem trước bên dưới đổi theo.
 */
export function StudyDaysPicker({ onChange, value }: StudyDaysPickerProps) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    hapticSelection();
    onChange(next.sort((a, b) => a - b));
  };

  return (
    <View accessibilityRole="none" className="flex-row flex-wrap gap-xs">
      {ROADMAP_WEEKDAYS.map((day) => (
        <Chip
          key={day.value}
          label={day.short}
          role="checkbox"
          selected={value.includes(day.value)}
          onPress={() => toggle(day.value)}
        />
      ))}
    </View>
  );
}
