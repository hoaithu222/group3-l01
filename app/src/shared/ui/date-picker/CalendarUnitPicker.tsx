import { Pressable, Text, View } from 'react-native';
import type { Dayjs } from 'dayjs';

import { CalendarControl } from './CalendarControl';
import { DECADE_LENGTH, UNIT_GRID_SIZE } from './date-picker.constants';
import { calendarStyles, calendarUnitStyles, type CalendarUnitState } from './date-picker.styles';
import type { CalendarLocale } from './date-picker.types';
import {
  buildDecadeCells,
  decadeStart,
  decadeTitleOf,
  isMonthDisabled,
  isYearDisabled,
  monthLabelOf,
} from './date-picker.utils';

export interface CalendarUnitPickerProps {
  className?: string;
  /** `year` = lưới thập kỷ · `month` = 12 tháng của một năm. */
  granularity: 'year' | 'month';
  locale: CalendarLocale;
  maxDay: Dayjs | null;
  minDay: Dayjs | null;
  /** Giá trị đang chọn, chỉ để tô ô. `null` = chưa chọn gì. */
  selected: Dayjs | null;
  /** Đầu đề có phải "tiêu đề" với trình đọc màn hình không — xem `CalendarControl`. */
  titleAsHeader?: boolean;
  /** Năm đang xem: lưới tháng lấy làm đầu đề, lưới năm lấy để suy ra thập kỷ. */
  year: number;
  /** Đổi năm đang xem — lưới năm nhảy 10, lưới tháng nhảy 1. */
  onChangeYear: (year: number) => void;
  /** `granularity="year"` trả về NĂM; `"month"` trả về chỉ số tháng 0–11. */
  onSelect: (value: number) => void;
}

/**
 * Lưới chọn NĂM và lưới chọn THÁNG — nhóm ② của guideline Figma (`259:97470`).
 *
 * Một component cho cả hai vì Figma vẽ chúng giống hệt nhau: cùng thanh điều
 * khiển, cùng lưới 3×4 ô viên thuốc, chỉ khác đầu đề (thập kỷ hay năm) và nhãn
 * ô (số năm hay "Tháng n").
 *
 * ⛔ Component KHÔNG giữ state: năm đang xem do `Calendar` giữ, vì luồng chọn
 * liên tiếp Năm → Tháng → Ngày phải mang năm vừa chọn sang nhịp sau.
 *
 * ⚠️ Hai ô thừa của lưới năm (2019 · 2030 khi đang xem thập kỷ 2020) vẫn CHỌN
 * ĐƯỢC, chỉ tô mờ như bản vẽ để cho biết chúng ngoài thập kỷ. Chặn lại thì
 * người dùng nhìn thấy đúng con số mình cần mà bấm không ăn, và phải tự đoán ra
 * là phải bấm mũi tên trước — một cái bẫy không có lý do gì để dựng.
 */
export function CalendarUnitPicker({
  className,
  granularity,
  locale,
  maxDay,
  minDay,
  selected,
  titleAsHeader,
  year,
  onChangeYear,
  onSelect,
}: CalendarUnitPickerProps) {
  const styles = calendarStyles();
  const isYear = granularity === 'year';
  const decadeFrom = decadeStart(year);

  const cells = isYear
    ? buildDecadeCells(decadeFrom).map((value) => ({
        disabled: isYearDisabled(value, { maxDay, minDay }),
        key: `year-${value}`,
        label: String(value),
        outside: value < decadeFrom || value >= decadeFrom + DECADE_LENGTH,
        selected: selected?.year() === value,
        spoken: `Năm ${value}`,
        value,
      }))
    : Array.from({ length: UNIT_GRID_SIZE }, (_, month) => ({
        disabled: isMonthDisabled(year, month, { maxDay, minDay }),
        key: `month-${month}`,
        label: monthLabelOf(locale, month),
        outside: false,
        selected: selected?.year() === year && selected.month() === month,
        spoken: `${monthLabelOf(locale, month)} năm ${year}`,
        value: month,
      }));

  const previousDisabled = Boolean(
    minDay && (isYear ? decadeFrom - 1 < minDay.year() : year - 1 < minDay.year()),
  );
  const nextDisabled = Boolean(
    maxDay && (isYear ? decadeFrom + DECADE_LENGTH > maxDay.year() : year + 1 > maxDay.year()),
  );

  return (
    <View className={styles.root({ className })}>
      <CalendarControl
        nextDisabled={nextDisabled}
        nextLabel={isYear ? 'Thập kỷ sau' : 'Năm sau'}
        previousDisabled={previousDisabled}
        previousLabel={isYear ? 'Thập kỷ trước' : 'Năm trước'}
        title={
          isYear ? decadeTitleOf(locale, decadeFrom, decadeFrom + DECADE_LENGTH - 1) : String(year)
        }
        titleAsHeader={titleAsHeader}
        onNext={() => onChangeYear(year + (isYear ? DECADE_LENGTH : 1))}
        onPrevious={() => onChangeYear(year - (isYear ? DECADE_LENGTH : 1))}
      />

      <View className={calendarUnitStyles().grid()}>
        {cells.map((cell) => {
          let state: CalendarUnitState = 'default';
          if (cell.selected) state = 'selected';
          else if (cell.disabled) state = 'disabled';
          else if (cell.outside) state = 'outside';

          const cellStyles = calendarUnitStyles({ state });

          return (
            <Pressable
              key={cell.key}
              /** ⚠️ Ô năm hiện "2024" trần — trình đọc màn hình cần nghe "Năm 2024". */
              accessibilityLabel={cell.spoken}
              accessibilityRole="button"
              accessibilityState={{ disabled: cell.disabled, selected: cell.selected }}
              className={cellStyles.cell()}
              disabled={cell.disabled}
              onPress={() => onSelect(cell.value)}
            >
              {({ pressed }) => (
                <View
                  className={cellStyles.pill({
                    /**
                     * Phản hồi lúc bấm lấy từ render-prop của `Pressable` —
                     * `className` KHÔNG nhận hàm. `action-tint` ở nhóm này chỉ
                     * còn một nghĩa duy nhất là "đang bấm".
                     */
                    className: pressed && !cell.selected ? 'bg-action-tint' : undefined,
                  })}
                  // ⛔ Ô chỉ có nền khi chọn/đang bấm ⇒ thiếu cờ này Android vẽ ô vuông (mất `rounded-full`) — xem `CalendarDay`.
                  collapsable={false}
                >
                  <Text className={cellStyles.label()}>{cell.label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
