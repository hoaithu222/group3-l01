import dayjs from 'dayjs';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import { SingleDatePicker, type SingleDatePickerSize } from '@/shared/ui/pickers/SingleDatePicker';

export interface DateFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  format?: string;
  size?: SingleDatePickerSize;
}

/** Pre-wired single date picker. Value stored as ISO date string (YYYY-MM-DD). */
function DateField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  minDate,
  maxDate,
  format,
  size,
}: DateFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  // Convert stored ISO string → Date for the picker
  const dateValue = field.value
    ? field.value instanceof Date
      ? field.value
      : new Date(field.value as string)
    : null;

  if (readOnly) {
    const display = dateValue ? dayjs(dateValue).format('DD/MM/YYYY') : '—';
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
      <SingleDatePicker
        {...a11y.trigger}
        disabled={disabled}
        format={format}
        invalid={Boolean(error)}
        maxDate={maxDate}
        minDate={minDate}
        placeholder={placeholder}
        size={size}
        value={dateValue}
        onChange={(date) => field.onChange(date ? dayjs(date).format('YYYY-MM-DD') : null)}
      />
    </FormItem>
  );
}

export default DateField;
