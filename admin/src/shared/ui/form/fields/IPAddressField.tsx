import { PatternFormat } from 'react-number-format';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import { cn } from '@/shared/utils/style/cn';
import type { FieldSize } from '../form.types';
import { FIELD_CONTROL_CLASS, FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

/** Bố cục riêng của ô IP; khung/nền/focus lấy từ `fieldSurface`. */
const INPUT_LAYOUT = 'inline-flex items-center gap-2 px-3';

export interface IPAddressFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: FieldSize;
  /** Include `:port` slot. Default false. */
  withPort?: boolean;
}

/**
 * IPv4 address field — mask `___.___.___.___` hoặc `___.___.___.___:_____`.
 *
 * Validation qua Zod schema — dùng `ipv4Field()` / `ipv4WithPortField()`
 * từ `@/shared/utils/validators.utils`.
 *
 * Phủ ca:
 * - Chỉ cho phép số + dấu `.` (mask lọc)
 * - Range 0-255 mỗi octet → validate ở schema Zod
 */
function IPAddressField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  size = 'md',
  withPort = false,
}: IPAddressFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const wrapperCn = cn(
    fieldSurface({ focusMode: 'within', invalid: Boolean(error) }),
    INPUT_LAYOUT,
    FIELD_HEIGHT[size],
  );

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{String(field.value ?? '—')}</span>
      </FormItem>
    );
  }

  const format = withPort ? '###.###.###.###:#####' : '###.###.###.###';
  const defaultPlaceholder = withPort ? '0.0.0.0:8080' : '0.0.0.0';

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
      <div className={wrapperCn}>
        <PatternFormat
          allowEmptyFormatting={false}
          {...a11y.input}
          className={FIELD_CONTROL_CLASS}
          disabled={disabled}
          format={format}
          getInputRef={field.ref}
          mask="_"
          placeholder={placeholder ?? defaultPlaceholder}
          value={field.value as string | undefined}
          valueIsNumericString={false}
          onBlur={field.onBlur}
          onValueChange={({ value }) => field.onChange(value)}
        />
      </div>
    </FormItem>
  );
}

export default IPAddressField;
