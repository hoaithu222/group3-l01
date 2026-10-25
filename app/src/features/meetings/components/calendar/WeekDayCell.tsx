import { Pressable, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

export interface WeekDayCellProps {
  /** Ngày có ≥ 1 cuộc họp — chấm dưới số ngày (nghĩa cũng có trong nhãn trợ năng). */
  busy: boolean;
  date: Date;
  /** Thứ viết tắt: "T2"…"CN". */
  label: string;
  selected: boolean;
  today: boolean;
  onPress: (date: Date) => void;
}

/**
 * Một ô ngày của dải tuần (điện thoại): thứ + số ngày + chấm "có họp" gói trong MỘT viên thuốc dọc 44×56.
 *
 * · Chọn ⇒ viên tô `action-base`, chữ và chấm đổi sang `action-fg` CÙNG CẶP (chấm `action-base` trên nền `action-base` là biến mất).
 * · Hôm nay ⇒ nền `action-tint` + chữ thương hiệu đậm — không chỉ bằng màu: nhãn trợ năng nói "hôm nay", `selected` ở `accessibilityState`.
 *
 * Vì sao viên thuốc chứ không phải vòng tròn quanh số như lưới tháng (`MonthDayCell`): dải chỉ có một hàng nên thứ + ngày đứng chung một khối
 * đọc liền mạch hơn, và khối 44×56 chính là vùng chạm NHÌN THẤY được — vòng 32dp cũ nhỏ hơn ngưỡng 44 nên người dùng không biết bấm tới đâu.
 */
export function WeekDayCell({ busy, date, label, onPress, selected, today }: WeekDayCellProps) {
  const day = date.getDate();
  const accessibilityLabel = [
    `${label} ngày ${String(day)} tháng ${String(date.getMonth() + 1)}`,
    today ? 'hôm nay' : null,
    busy ? 'có cuộc họp' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-1 items-center"
      onPress={() => onPress(date)}
    >
      {({ pressed }) => (
        <View
          className={cn(
            // `w-full max-w-11`: 44dp trên máy thường, co theo cột ở máy hẹp 320dp (41dp/cột) thay vì đè sang ô bên cạnh.
            'min-h-14 w-full max-w-11 items-center justify-center gap-3xs rounded-sm py-2xs',
            selected ? 'bg-action-base' : today ? 'bg-action-tint' : pressed && 'bg-bg-primary',
          )}
          /**
           * ⛔ `collapsable={false}` BẮT BUỘC — thiếu nó viên thuốc vừa được CHỌN hiện thành HÌNH VUÔNG trên Android (đã thấy trên
           * máy). Ô ngày thường không có nền nên Fabric "làm phẳng" (không dựng view native); lúc được chọn nó mới có nền và Android
           * dựng view với ĐÚNG phần props vừa đổi (`backgroundColor`) — `rounded-sm` đặt từ trước rơi mất. Chi tiết:
           * `docs/rules/styling-nativewind.md` → "Cạm bẫy".
           */
          collapsable={false}
        >
          {/* Chữ trong khối cao CỨNG: chặn TRẦN 1.3× (đúng mẫu `MonthDayCell`/`Chip`) để số ngày không lòi khỏi viên thuốc khi
              người dùng phóng cỡ chữ hệ thống. ⛔ Không `allowFontScaling={false}` — đó là phủ quyết nhu cầu của người đọc kém. */}
          <Text
            className={cn(
              'text-caption-sm',
              selected ? 'text-action-fg' : today ? 'font-semibold text-fg-brand' : 'text-fg-2',
            )}
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
          <Text
            className={cn(
              'text-label-lg',
              selected
                ? 'font-semibold text-action-fg'
                : today
                  ? 'font-semibold text-fg-brand'
                  : 'text-fg-1',
            )}
            maxFontSizeMultiplier={1.3}
          >
            {day}
          </Text>
          {/* Chấm "có họp" chỉ có nền khi dữ liệu về (lúc đang tải thì chưa) ⇒ cùng bẫy làm phẳng: thiếu `collapsable` là chấm vuông. */}
          <View
            className={cn(
              'h-1 w-1 rounded-full',
              busy && (selected ? 'bg-action-fg' : 'bg-action-base'),
            )}
            collapsable={false}
          />
        </View>
      )}
    </Pressable>
  );
}
