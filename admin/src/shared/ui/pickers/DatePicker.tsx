// Thin wrapper — kept for backward compatibility. Prefer SingleDatePicker / RangeDatePicker directly.
import type { DateRange, QuickSelectOption } from './date-picker-types';
import { SingleDatePicker, type SingleDatePickerSize } from './SingleDatePicker';
import { RangeDatePicker } from './RangeDatePicker';

export type { DateRange, QuickSelectOption } from './date-picker-types';
export { DEFAULT_QUICK_OPTIONS } from './date-picker-types';
export type { SingleDatePickerProps, SingleDatePickerSize } from './SingleDatePicker';
export type { RangeDatePickerProps, RangeDatePickerSize } from './RangeDatePicker';

export type DatePickerSize = SingleDatePickerSize;

export interface DatePickerProps {
  mode?: 'single' | 'range';
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
  showQuickSelect?: boolean;
  quickSelectOptions?: QuickSelectOption[];
  placeholder?: string;
  format?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  invalid?: boolean;
  size?: DatePickerSize;
  className?: string;
}

export function DatePicker({
  mode = 'single',
  value,
  onChange,
  range,
  onRangeChange,
  showQuickSelect,
  quickSelectOptions,
  ...shared
}: DatePickerProps) {
  if (mode === 'range') {
    return (
      <RangeDatePicker
        quickSelectOptions={quickSelectOptions}
        range={range}
        showQuickSelect={showQuickSelect}
        onRangeChange={onRangeChange}
        {...shared}
      />
    );
  }
  return <SingleDatePicker value={value} onChange={onChange} {...shared} />;
}
