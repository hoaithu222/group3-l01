import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import NumberInput from '@/shared/ui/inputs/NumberInput';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { FieldSize } from '../form.types';

export interface NumberFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  size?: FieldSize;
  /** Hiện nút "x" reset giá trị về 0 khi value khác 0. */
  clearable?: boolean;
}

/** Numeric input — value stored as number. Use MaskedField for formatted display. */
function NumberField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  min,
  max,
  step,
  size,
  clearable,
}: NumberFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{field.value ?? '—'}</span>
      </FormItem>
    );
  }

  const numValue = Number(field.value);
  const inputValue =
    field.value == null || field.value === '' || Number.isNaN(numValue) ? null : numValue;
  const canClear =
    clearable && !disabled && field.value != null && !Number.isNaN(numValue) && numValue !== 0;

  return (
    <FormItem
      {...a11y.item}
      className={className}
      description={description}
      error={error}
      htmlFor={a11y.id}
      label={label}
      required={required}
    >
      <NumberInput
        {...field}
        {...a11y.input}
        disabled={disabled}
        invalid={Boolean(error)}
        max={max}
        min={min}
        placeholder={placeholder}
        size={size}
        step={step}
        suffix={
          canClear ? (
            <button
              aria-label="Xóa giá trị"
              className="inline-flex items-center justify-center text-fg-4 transition-colors hover:text-fg-1 cursor-pointer"
              type="button"
              onClick={() => field.onChange(0)}
            >
              <SystemIcon name="circle-xmark-outline" size={16} />
            </button>
          ) : undefined
        }
        value={inputValue}
        onChange={(v) => field.onChange(v)}
      />
    </FormItem>
  );
}

export default NumberField;
