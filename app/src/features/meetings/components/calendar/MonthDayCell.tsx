import { Pressable, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { WEEKDAY_SHORT } from '../../constants/meetings.constants';

export interface MonthDayCellProps {
  /** Số cuộc họp trong ngày (không tính đã huỷ). */
  count: number;
  date: Date;
  /** Ngày thuộc tháng đang xem — ngày tràn của tháng kề chỉ mờ đi, vẫn chọn được. */
  inMonth: boolean;
  selected: boolean;
  today: boolean;
  onPress: (date: Date) => void;
}

/** Tối đa 3 chấm — nhiều hơn thì chấm chỉ còn là nhiễu; số chính xác nằm ở nhãn trợ năng và danh sách bên cạnh. */
const MAX_DOTS = 3;

/**
 * Một ô ngày của lưới tháng: số ngày (vòng tô khi chọn, nền nhạt + chữ thương hiệu khi là hôm nay) + chấm báo có họp. Trạng thái không chỉ bằng màu:
 * nhãn trợ năng nói rõ "có N cuộc họp", "hôm nay", "đang chọn". Cao ≥ 44dp (`min-h-11`), rộng hơn từ máy tính bảng.
 */
export function MonthDayCell({
  count,
  date,
  inMonth,
  onPress,
  selected,
  today,
}: MonthDayCellProps) {
  const weekday = WEEKDAY_SHORT[(date.getDay() + 6) % 7];
  const label = [
    `${weekday} ngày ${String(date.getDate())} tháng ${String(date.getMonth() + 1)}`,
    today ? 'hôm nay' : null,
    count > 0 ? `${String(count)} cuộc họp` : 'không có cuộc họp',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="min-h-11 flex-1 items-center justify-center gap-3xs tablet:min-h-14"
      onPress={() => onPress(date)}
    >
      {/* Hôm nay: nền `action-tint` + chữ thương hiệu đậm — CÙNG ngôn ngữ với ô ngày của dải tuần (`WeekDayCell`) ở điện thoại,
          để xoay máy/đổi sang máy tính bảng không phải học lại "hôm nay trông thế nào". */}
      <View
        className={cn(
          'h-8 w-8 items-center justify-center rounded-full',
          selected && 'bg-action-base',
          !selected && today && 'bg-action-tint',
        )}
        // ⛔ Ô ngày thường KHÔNG có nền ⇒ Android dựng view lúc mới được chọn mà mất `rounded-full` (vòng thành ô vuông) —
        // xem `WeekDayCell` và `docs/rules/styling-nativewind.md` → "Cạm bẫy".
        collapsable={false}
      >
        {/* Vòng tròn cao CỨNG 32dp (`h-8`): chữ phóng 2× (cỡ chữ hệ thống) cao ~40dp và lòi ra ngoài vòng — chặn TRẦN 1.3×,
            đúng mẫu `Badge`/`Chip`. ⛔ Không `allowFontScaling={false}`: đó là phủ quyết nhu cầu của người đọc kém. */}
        <Text
          className={cn(
            'text-label-md',
            selected
              ? 'font-semibold text-action-fg'
              : today
                ? 'font-semibold text-fg-brand'
                : inMonth
                  ? 'text-fg-1'
                  : 'text-fg-2',
          )}
          maxFontSizeMultiplier={1.3}
        >
          {date.getDate()}
        </Text>
      </View>
      <View className="h-1 flex-row gap-3xs">
        {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
          <View key={index} className="h-1 w-1 rounded-full bg-action-base" />
        ))}
      </View>
    </Pressable>
  );
}
