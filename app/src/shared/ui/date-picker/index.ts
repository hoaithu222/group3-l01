/**
 * Barrel của nhóm `date-picker`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 */
export { Calendar } from './Calendar';
export { DatePicker } from './DatePicker';
export {
  DATE_FORMAT_DEFAULT,
  MONTH_FORMAT_DEFAULT,
  VI_LOCALE,
  YEAR_FORMAT_DEFAULT,
} from './date-picker.constants';
export type {
  CalendarLocale,
  CalendarProps,
  CalendarRangeProps,
  CalendarSingleProps,
  DateLike,
  DatePickerMode,
  DatePickerPrecision,
  DatePickerProps,
  DatePickerRangeProps,
  DatePickerSingleProps,
  DateRange,
  WeekdayIndex,
} from './date-picker.types';
