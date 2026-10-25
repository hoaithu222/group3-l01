import { useMemo } from 'react';
import { Text, View } from 'react-native';
import dayjs, { type Dayjs } from 'dayjs';

import { CalendarControl } from './CalendarControl';
import { CalendarDay } from './CalendarDay';
import {
  calendarStyles,
  type CalendarDayState,
  type CalendarRangePosition,
} from './date-picker.styles';
import type { CalendarLocale, WeekdayIndex } from './date-picker.types';
import {
  buildMonthGrid,
  describeDay,
  isBetween,
  isDayDisabled,
  orderedWeekdays,
} from './date-picker.utils';

export interface CalendarMonthViewProps {
  className?: string;
  disabledDays: readonly Dayjs[];
  firstDayOfWeek: WeekdayIndex;
  locale: CalendarLocale;
  maxDay: Dayjs | null;
  minDay: Dayjs | null;
  /** Đầu CUỐI của khoảng đang chọn. `null` ở chế độ một giá trị. */
  rangeEnd: Dayjs | null;
  rangeStart: Dayjs | null;
  /** Ngày đang chọn ở chế độ một giá trị. `null` ở chế độ khoảng. */
  selected: Dayjs | null;
  /** Tiêu đề tháng có phải "tiêu đề" với trình đọc màn hình không — xem `CalendarControl`. */
  titleAsHeader?: boolean;
  visibleMonth: Dayjs;
  onChangeMonth: (month: Dayjs) => void;
  onPressDay: (day: Dayjs) => void;
}

/**
 * Lưới NGÀY của một tháng: thanh điều khiển, hàng nhãn thứ, 6 hàng ngày.
 *
 * Tách khỏi `Calendar` khi thêm hai lưới Năm/Tháng: gộp cả ba vào một file thì
 * `Calendar.tsx` vượt xa giới hạn 200 dòng, và phần "chọn tháng nào đang xem"
 * lẫn với phần "vẽ 42 ô".
 *
 * ⛔ Component này KHÔNG giữ state. Tháng đang xem do `Calendar` giữ — luồng
 * chọn liên tiếp Năm → Tháng → Ngày cần đặt lại tháng đó từ bên ngoài.
 */
export function CalendarMonthView({
  className,
  disabledDays,
  firstDayOfWeek,
  locale,
  maxDay,
  minDay,
  rangeEnd,
  rangeStart,
  selected,
  titleAsHeader,
  visibleMonth,
  onChangeMonth,
  onPressDay,
}: CalendarMonthViewProps) {
  const styles = calendarStyles();

  const previousMonth = visibleMonth.subtract(1, 'month');
  const followingMonth = visibleMonth.add(1, 'month');
  const previousDisabled = Boolean(minDay && previousMonth.endOf('month').isBefore(minDay, 'day'));
  const followingDisabled = Boolean(
    maxDay && followingMonth.startOf('month').isAfter(maxDay, 'day'),
  );

  const weekdays = useMemo(() => orderedWeekdays(locale, firstDayOfWeek), [locale, firstDayOfWeek]);
  const grid = useMemo(
    () => buildMonthGrid(visibleMonth, firstDayOfWeek),
    [visibleMonth, firstDayOfWeek],
  );

  const today = dayjs();

  return (
    <View className={styles.root({ className })}>
      <CalendarControl
        nextDisabled={followingDisabled}
        nextLabel="Tháng sau"
        previousDisabled={previousDisabled}
        previousLabel="Tháng trước"
        title={locale.monthTitle(visibleMonth.month(), visibleMonth.year())}
        titleAsHeader={titleAsHeader}
        onNext={() => onChangeMonth(followingMonth)}
        onPrevious={() => onChangeMonth(previousMonth)}
      />

      {/* Nhãn thứ thuần trang trí: mỗi ô ngày đã tự đọc đủ "Thứ Hai, 8 tháng 9…". */}
      <View
        accessibilityElementsHidden
        className={styles.weekRow()}
        importantForAccessibility="no-hide-descendants"
      >
        {/* `numberOfLines={1}`: nhãn thứ ("CN", "T2") phải nằm đúng một dòng để
            thẳng hàng với cột số bên dưới; hàng đã là `min-h-10` nên cỡ chữ
            phóng to làm hàng CAO LÊN chứ không cắt chữ. */}
        {weekdays.map((weekday) => (
          <Text key={weekday} className={styles.weekLabel()} numberOfLines={1}>
            {weekday}
          </Text>
        ))}
      </View>

      {grid.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} className={styles.row()}>
          {week.map((day) => {
            const outside = !day.isSame(visibleMonth, 'month');
            const disabled = outside || isDayDisabled(day, { disabledDays, maxDay, minDay });
            const isSelected = Boolean(
              selected?.isSame(day, 'day') ||
              rangeStart?.isSame(day, 'day') ||
              rangeEnd?.isSame(day, 'day'),
            );

            let state: CalendarDayState = 'default';
            if (isSelected) state = 'selected';
            else if (day.isSame(today, 'day')) state = disabled ? 'todayDisabled' : 'today';
            else if (outside) state = 'outside';
            else if (disabled) state = 'disabled';

            /** Dải nền chỉ vẽ khi khoảng đã có ĐỦ hai đầu và không trùng nhau. */
            let rangePosition: CalendarRangePosition = 'none';
            if (rangeStart && rangeEnd && !rangeStart.isSame(rangeEnd, 'day')) {
              if (day.isSame(rangeStart, 'day')) rangePosition = 'start';
              else if (day.isSame(rangeEnd, 'day')) rangePosition = 'end';
              else if (isBetween(day, rangeStart, rangeEnd)) rangePosition = 'middle';
            }

            return (
              <CalendarDay
                key={day.valueOf()}
                day={day}
                disabled={disabled}
                label={describeDay(day, locale)}
                rangePosition={rangePosition}
                selected={isSelected}
                state={state}
                onPress={onPressDay}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
