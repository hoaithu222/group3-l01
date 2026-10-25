import { Text, View } from 'react-native';

import type { WellbeingDaily } from '../api/wellbeing.types';
import { formatDayMonth, formatMinutes, weekdayShort } from '../utils/wellbeing-format';
import {
  chartCeiling,
  daysWithData,
  summarizeSeries,
  type DaySlot,
} from '../utils/wellbeing-series';

/**
 * Vùng cột cao 128dp (h-32), có đường nền. Hai bản chỉ khác khe giữa các cột: 30 cột mảnh cần khe hẹp (30 cột + 29 khe 8dp = tràn màn 320dp).
 * Nhãn thứ ở dưới dùng CÙNG khe nên thẳng hàng với cột.
 */
const AREA_WIDE = 'h-32 flex-row items-end gap-xs border-b border-border-1';
const AREA_COMPACT = 'h-32 flex-row items-end gap-3xs border-b border-border-1';
/** Số ngày từ đây trở lên thì vẽ cột mảnh và bỏ nhãn từng cột. */
const COMPACT_FROM = 10;

function Bar({ ceiling, daily }: { ceiling: number; daily: WellbeingDaily }) {
  const total = Math.max(0, daily.activeMinutes);
  if (total === 0) return null;
  // Phần khuya là MỘT PHẦN của tổng hoạt động (khe 15 phút nằm trong 23:00–05:00) — kẹp để dữ liệu lệch không vẽ phần khuya lớn hơn cả cột.
  const late = Math.min(Math.max(0, daily.lateNightMinutes), total);
  // Tối thiểu 3% để ngày có hoạt động ít vẫn thấy được một vệt (0 phút thì không có cột).
  const percent = Math.max(3, Math.round((total / ceiling) * 100));
  return (
    <View className="w-full overflow-hidden rounded-t-3xs" style={{ height: `${percent}%` }}>
      <View className="bg-action-accent" style={{ flex: late }} />
      <View className="bg-action-base" style={{ flex: total - late }} />
    </View>
  );
}

function LegendItem({ label, swatchClass }: { label: string; swatchClass: string }) {
  return (
    <View className="flex-row items-center gap-xs">
      <View className={swatchClass} />
      <Text className="text-caption-sm text-fg-2">{label}</Text>
    </View>
  );
}

/**
 * Cột "phút hoạt động mỗi ngày" + phần khuya (app.md p7-03 §2 `ActivityBars`). Dựng bằng `View` (không SVG, không hoạt cảnh): cột chỉ là hình tĩnh nên **không có chuyển động nào để giảm** —
 * tôn trọng "giảm chuyển động" mặc nhiên. Trợ năng: cả biểu đồ là MỘT phần tử `image` với câu tóm tắt (số ngày có số liệu, ngày nhiều nhất) và chỉ sang **bảng thay thế**
 * (`ActivityTable`, nút "Xem dạng bảng" ở cha) để nghe từng ngày — cột thì trình đọc màn hình không đọc được.
 *
 * Thang: cột cao nhất = ngày hoạt động nhiều nhất trong cửa sổ, nói thành chữ ngay trên biểu đồ (không trục số — tránh đọc con số như "điểm"). Ngày KHÔNG có số liệu để trống
 * (không phải cột 0: "không biết" ≠ "không hoạt động"). 7 ngày: nhãn thứ dưới từng cột; 30 ngày: cột mảnh, chỉ nhãn ngày đầu/giữa/cuối.
 * Màu không là dấu hiệu duy nhất: chú giải bằng chữ, số cụ thể ở bảng.
 */
export function ActivityBars({ slots }: { slots: readonly DaySlot[] }) {
  const ceiling = chartCeiling(slots);
  const compact = slots.length >= COMPACT_FROM;
  const marks = [0, Math.floor(slots.length / 2), slots.length - 1].flatMap((index) => {
    const slot = slots[index];
    return slot ? [slot] : [];
  });

  return (
    <View className="gap-sm">
      <View
        accessibilityLabel={summarizeSeries(slots)}
        accessibilityRole="image"
        accessible
        className="gap-xs"
      >
        {daysWithData(slots) > 0 ? (
          <Text className="text-caption-sm text-fg-2">
            {`Cột cao nhất: ${formatMinutes(ceiling)}`}
          </Text>
        ) : null}
        <View className={compact ? AREA_COMPACT : AREA_WIDE}>
          {slots.map((slot) => (
            <View key={slot.date} className="h-full flex-1 justify-end">
              {slot.daily ? <Bar ceiling={ceiling} daily={slot.daily} /> : null}
            </View>
          ))}
        </View>
        {compact ? (
          <View className="flex-row justify-between">
            {marks.map((slot) => (
              <Text key={slot.date} className="text-label-xs text-fg-2">
                {formatDayMonth(slot.date)}
              </Text>
            ))}
          </View>
        ) : (
          <View className="flex-row gap-xs">
            {slots.map((slot) => (
              <Text key={slot.date} className="flex-1 text-center text-label-xs text-fg-2">
                {weekdayShort(slot.date)}
              </Text>
            ))}
          </View>
        )}
      </View>
      <View className="flex-row flex-wrap items-center gap-md">
        <LegendItem label="Hoạt động" swatchClass="h-3 w-3 rounded-full bg-action-base" />
        <LegendItem
          label="Trong khung khuya (23:00–05:00)"
          swatchClass="h-3 w-3 rounded-full bg-action-accent"
        />
      </View>
    </View>
  );
}
