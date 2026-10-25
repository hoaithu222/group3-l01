import { NumericFormat, PatternFormat } from 'react-number-format';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import { cn } from '@/shared/utils/style/cn';
import type { FieldSize } from '../form.types';
import { FIELD_CONTROL_CLASS, FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

/** Bố cục riêng của ô có mặt nạ; khung/nền/focus lấy từ `fieldSurface`. */
const INPUT_LAYOUT = 'inline-flex items-center gap-2 px-3';

export type MaskType = 'currency' | 'phone' | 'tax' | 'percent';

export interface MaskedFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Preset mask types. Use `format` for a custom PatternFormat. */
  mask?: MaskType;
  /** Custom PatternFormat string, e.g. "####-####". Overrides `mask`. */
  format?: string;
  /** Height preset (sm=32 / md=36 / lg=40). Default: md. */
  size?: FieldSize;
}

// Discriminated config so TS knows `pattern` props include the required `format` key.
type MaskConfig =
  | { type: 'numeric'; props: Record<string, unknown> }
  | { type: 'pattern'; props: { format: string; mask?: string } };

const MASK_CONFIGS: Record<MaskType, MaskConfig> = {
  currency: { type: 'numeric', props: { thousandSeparator: ',', suffix: ' ₫', decimalScale: 0 } },
  phone: { type: 'pattern', props: { format: '#### ### ###', mask: '_' } },
  tax: { type: 'pattern', props: { format: '##########-###', mask: '_' } },
  percent: { type: 'numeric', props: { suffix: '%', decimalScale: 2, max: 100 } },
};

/** Formatted input using react-number-format. Supports currency, phone, tax, percent, and custom formats. */
function MaskedField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  mask = 'currency',
  format: customFormat,
  size = 'md',
}: MaskedFieldProps) {
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

  const sharedInputProps = {
    ...a11y.input,
    value: field.value as string | number | undefined,
    onValueChange: ({ value }: { value: string }) => field.onChange(value),
    onBlur: field.onBlur,
    disabled,
    placeholder,
    className: FIELD_CONTROL_CLASS,
    getInputRef: field.ref,
  };

  const renderInput = () => {
    if (customFormat) {
      return <PatternFormat {...sharedInputProps} format={customFormat} mask="_" />;
    }
    const cfg = MASK_CONFIGS[mask];
    if (cfg.type === 'pattern') {
      return <PatternFormat {...sharedInputProps} {...cfg.props} />;
    }
    return <NumericFormat {...sharedInputProps} {...cfg.props} />;
  };

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
      <div className={wrapperCn}>{renderInput()}</div>
    </FormItem>
  );
}

export default MaskedField;
