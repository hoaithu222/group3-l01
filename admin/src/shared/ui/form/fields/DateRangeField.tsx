import dayjs from 'dayjs';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import { RangeDatePicker, type RangeDatePickerSize } from '@/shared/ui/pickers/RangeDatePicker';
import type { DateRange } from '@/shared/ui/pickers/date-picker-types';

export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

export interface DateRangeFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  showQuickSelect?: boolean;
  size?: RangeDatePickerSize;
}

/** Pre-wired date range picker. Value stored as `{ from: string|null, to: string|null }` (ISO dates). */
function DateRangeField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  minDate,
  maxDate,
  showQuickSelect,
  size,
}: DateRangeFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const val = (field.value ?? {}) as Partial<DateRangeValue>;

  const range: DateRange = {
    from: val.from ? new Date(val.from) : null,
    to: val.to ? new Date(val.to) : null,
  };

  if (readOnly) {
    const fromStr = range.from ? dayjs(range.from).format('DD/MM/YYYY') : '';
    const toStr = range.to ? dayjs(range.to).format('DD/MM/YYYY') : '';
    const display = fromStr ? `${fromStr}${toStr ? ` - ${toStr}` : ''}` : '—';
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{display}</span>
      </FormItem>
    );
  }

  return (
    <FormItem
      {...a11y.item}
      className={className}
      description={description}
      error={error}
      label={label}
      required={required}
    >
      <RangeDatePicker
        {...a11y.trigger}
        disabled={disabled}
        invalid={Boolean(error)}
        maxDate={maxDate}
        minDate={minDate}
        placeholder={placeholder}
        range={range}
        showQuickSelect={showQuickSelect}
        size={size}
        onRangeChange={(r) =>
          field.onChange({
            from: r.from ? dayjs(r.from).format('YYYY-MM-DD') : null,
            to: r.to ? dayjs(r.to).format('YYYY-MM-DD') : null,
          })
        }
      />
    </FormItem>
  );
}

export default DateRangeField;
