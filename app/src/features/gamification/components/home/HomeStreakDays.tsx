import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { DayBucket } from '../../utils/xp-week.types';

function dayA11yLabel(day: DayBucket): string {
  const when = day.isToday ? `Hôm nay, ${day.dateLabel}` : `${day.weekday}, ${day.dateLabel}`;
  return `${when}: ${day.active ? 'có hoạt động' : 'chưa có hoạt động'}`;
}

/**
 * Ô tròn của một ngày — ba dáng, cùng MỘT tia sét để cả dải đọc như một hàng thống nhất:
 *  · có hoạt động: nền đặc `action-base` + tia sét `action-fg` (⚠️ không `fg-inverse`: ở chế độ tối nền này là màu SÁNG);
 *  · HÔM NAY chưa hoạt động: nền `surface-primary` + viền thương hiệu + tia sét `fg-brand` — "còn kịp", mời làm ngay;
 *  · ngày đã qua chưa hoạt động: nền `bg-3` + viền `border-1` + tia sét mờ `fg-3` (hình trang trí, không phải chữ).
 *
 * ⛔ Đừng quay lại ô RỖNG `bg-bg-2` của bản trước: `bg-2` (#FBFBFB) trên thẻ `bg-1` (#FFFFFF) chỉ ~1.02:1 — bảy chấm
 * gần như vô hình, cả dải trông như khung xương tải hỏng (người dùng báo "box chuỗi chăm chỉ đang lỗi"), còn ô hôm nay
 * chỉ có vòng viền đậm nên nổi lên như một nút radio lạc chỗ.
 */
function DayDot({ day }: { day: DayBucket }) {
  if (day.active) {
    return (
      <View className="size-3xl items-center justify-center rounded-full bg-action-base">
        <Icon color="action-fg" name="flash" size="xs" />
      </View>
    );
  }
  if (day.isToday) {
    return (
      <View className="size-3xl items-center justify-center rounded-full border-medium border-border-brand bg-surface-primary">
        <Icon color="fg-brand" name="flash" size="xs" />
      </View>
    );
  }
  return (
    <View className="size-3xl items-center justify-center rounded-full border-hairline border-border-1 bg-bg-3">
      <Icon color="fg-3" name="flash" size="xs" />
    </View>
  );
}

/**
 * Dải 7 ngày (cũ → mới, hôm nay ở cuối): ô tròn theo trạng thái (`DayDot`) + nhãn thứ bên dưới — nhãn ở DƯỚI cho thẳng
 * hàng với biểu đồ cột "Hoạt động 7 ngày" ngay sau thẻ này. Hôm nay: nhãn đậm màu thương hiệu. Trạng thái không chỉ
 * nằm ở màu: mỗi cột là MỘT ô trợ năng có câu đầy đủ ("Hôm nay, 29/09: chưa có hoạt động").
 *
 * Cột `flex-1` chia đều bề ngang, ô tròn 32dp: máy hẹp 320dp vẫn đủ chỗ (thẻ còn ~256dp ⇒ ~30dp mỗi cột + khe 8,
 * ô chỉ lấn vào khe chứ không chồng nhau). ⚠️ Đừng phóng lên 40dp: ở 360dp mỗi cột chỉ còn ~35dp.
 */
export function HomeStreakDays({ days }: { days: readonly DayBucket[] }) {
  return (
    <View className="flex-row gap-xs">
      {days.map((day) => (
        <View
          key={day.dateKey}
          accessibilityLabel={dayA11yLabel(day)}
          accessible
          className="flex-1 items-center gap-2xs"
        >
          <DayDot day={day} />
          <Text
            className={
              day.isToday
                ? 'text-caption-sm font-semibold text-fg-brand'
                : 'text-caption-sm text-fg-2'
            }
          >
            {day.weekday}
          </Text>
        </View>
      ))}
    </View>
  );
}
