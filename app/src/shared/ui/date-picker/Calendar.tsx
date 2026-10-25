import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

import { CalendarMonthView } from './CalendarMonthView';
import { CalendarUnitPicker } from './CalendarUnitPicker';
import { VI_LOCALE } from './date-picker.constants';
import type { CalendarProps, DatePickerPrecision } from './date-picker.types';
import { nextRange, toDay, toLocalDate } from './date-picker.utils';

/** Nhịp lưới đang hiện. */
type CalendarStep = 'year' | 'month' | 'day';

/**
 * Nhịp ĐẦU TIÊN theo độ chi tiết. Chỉ `year-month-day` là có nhiều nhịp: nó bắt
 * đầu ở lưới Năm rồi đi tiếp sang Tháng và Ngày (Figma đánh số ③).
 */
const FIRST_STEP: Record<DatePickerPrecision, CalendarStep> = {
  day: 'day',
  month: 'month',
  year: 'year',
  'year-month-day': 'year',
};

/**
 * Lưới lịch THUẦN — không có vỏ tấm trượt, không tự mở đóng gì cả.
 *
 * Đặt thẳng vào màn hình, vào `DatePicker`, hay vào bottom sheet của người khác
 * đều được. Trạng thái duy nhất nó tự giữ là THÁNG ĐANG XEM và NHỊP đang đứng;
 * giá trị đang chọn luôn do nơi gọi giữ (`value` + `onChange`).
 *
 * ── Bốn độ chi tiết, đúng bốn nhóm đánh số của Figma ────────────────────────
 * `precision="day"` (mặc định) vẽ lưới ngày như trước. `"month"` / `"year"` vẽ
 * lưới 3×4 của `CalendarUnitPicker`. `"year-month-day"` đi lần lượt cả ba nhịp
 * và chỉ gọi `onChange` ở nhịp CUỐI — bắn ra sớm hơn thì màn hình cha nhận một
 * ngày mà người dùng chưa chọn xong.
 *
 * ⚠️ Nhịp đầu chốt lúc dựng component. Đổi `precision` giữa chừng KHÔNG kéo lưới
 * về nhịp đầu — muốn vậy thì gắn `key` khác cho `Calendar`. `DatePicker` đã làm
 * sẵn việc đó bằng cách chỉ dựng lịch khi tấm trượt đang mở.
 *
 * ── ⛔ Ngày ở đây là NGÀY ĐỊA PHƯƠNG ─────────────────────────────────────────
 * `onChange` trả `Date` lúc nửa đêm giờ máy. Mọi so sánh dùng
 * `isSame(other, 'day')` chứ không so timestamp — hai `Date` cùng ngày nhưng
 * khác giờ có timestamp khác nhau, nên so thô thì ngày do máy chủ trả về (có
 * kèm giờ) sẽ KHÔNG sáng lên trong lịch. Chi tiết ở `date-picker.utils.ts`.
 *
 * ── Lệch có chủ đích so với Figma ───────────────────────────────────────────
 * Bản thiết kế cho chế độ khoảng cuộn dọc nhiều tháng liền nhau. Ở đây cả hai
 * chế độ dùng chung một tháng + hai mũi tên: cuộn vô hạn cần danh sách ảo và
 * một vòng đo chiều cao riêng, mà lợi ích chỉ có ở ca chọn khoảng dài.
 */
export function Calendar(props: CalendarProps) {
  const {
    className,
    disabledDates,
    firstDayOfWeek = 1,
    locale = VI_LOCALE,
    maxDate,
    minDate,
    titleAsHeader = true,
  } = props;

  const isRange = props.mode === 'range';
  /** ⛔ Chọn KHOẢNG luôn theo NGÀY — bản vẽ không có lưới khoảng theo tháng/năm. */
  const precision: DatePickerPrecision = isRange ? 'day' : (props.precision ?? 'day');

  const minDay = useMemo(() => toDay(minDate), [minDate]);
  const maxDay = useMemo(() => toDay(maxDate), [maxDate]);
  const disabledDays = useMemo(
    () =>
      (disabledDates ?? [])
        .map((value) => toDay(value))
        .filter((value): value is Dayjs => value !== null),
    [disabledDates],
  );

  const single = isRange ? null : toDay(props.value);
  const rangeStart = isRange ? toDay(props.value?.start) : null;
  const rangeEnd = isRange ? toDay(props.value?.end) : null;

  /**
   * Tháng mở ra lần đầu: tháng của giá trị đang có, không có thì tháng này.
   * ⚠️ Cố ý KHÔNG đồng bộ lại khi `value` đổi — người dùng vừa lật sang tháng 3
   * để xem, một `setState` từ màn hình cha sẽ kéo họ về tháng cũ giữa chừng.
   */
  const [visibleMonth, setVisibleMonth] = useState(() =>
    (single ?? rangeStart ?? dayjs()).startOf('month'),
  );
  const [step, setStep] = useState<CalendarStep>(() => FIRST_STEP[precision]);

  /** ⚠️ Kiểm `props.mode` NGAY TRONG hàm: TypeScript không giữ narrowing qua closure. */
  const emitSingle = (day: Dayjs) => {
    if (props.mode !== 'range') props.onChange?.(toLocalDate(day));
  };

  const handlePressDay = (day: Dayjs) => {
    if (props.mode === 'range') props.onChange?.(nextRange(props.value, day));
    else props.onChange?.(toLocalDate(day));
  };

  const handleSelectYear = (value: number) => {
    const picked = visibleMonth.year(value);
    setVisibleMonth(picked);
    /** Chỉ chọn tới NĂM ⇒ trả về ngày đầu năm và dừng ở đây. */
    if (precision === 'year') emitSingle(picked.startOf('year'));
    else setStep('month');
  };

  const handleSelectMonth = (value: number) => {
    const picked = visibleMonth.month(value).startOf('month');
    setVisibleMonth(picked);
    /** Chỉ chọn tới THÁNG ⇒ trả về ngày đầu tháng. */
    if (precision === 'month') emitSingle(picked);
    else setStep('day');
  };

  if (step !== 'day') {
    return (
      <CalendarUnitPicker
        className={className}
        granularity={step}
        locale={locale}
        maxDay={maxDay}
        minDay={minDay}
        selected={single}
        titleAsHeader={titleAsHeader}
        year={visibleMonth.year()}
        onChangeYear={(value) => setVisibleMonth(visibleMonth.year(value))}
        onSelect={step === 'year' ? handleSelectYear : handleSelectMonth}
      />
    );
  }

  return (
    <CalendarMonthView
      className={className}
      disabledDays={disabledDays}
      firstDayOfWeek={firstDayOfWeek}
      locale={locale}
      maxDay={maxDay}
      minDay={minDay}
      rangeEnd={rangeEnd}
      rangeStart={rangeStart}
      selected={single}
      titleAsHeader={titleAsHeader}
      visibleMonth={visibleMonth}
      onChangeMonth={setVisibleMonth}
      onPressDay={handlePressDay}
    />
  );
}
