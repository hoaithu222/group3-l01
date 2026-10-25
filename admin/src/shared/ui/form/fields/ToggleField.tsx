import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Toggle, { type ToggleSize } from '@/shared/ui/inputs/Toggle';

export interface ToggleFieldProps {
  name: string;
  label?: string;
  toggleLabel?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  size?: ToggleSize;
  className?: string;
}

/** Pre-wired Toggle (Switch) field. */
function ToggleField({
  name,
  label,
  toggleLabel,
  required,
  description,
  disabled,
  size,
  className,
}: ToggleFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const checked = Boolean(field.value);

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{checked ? 'Bật' : 'Tắt'}</span>
      </FormItem>
    );
  }

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
      <Toggle
        aria-describedby={a11y.trigger['aria-describedby']}
        aria-invalid={a11y.trigger['aria-invalid']}
        aria-labelledby={a11y.trigger['aria-labelledby']}
        checked={checked}
        disabled={disabled}
        id={a11y.id}
        label={toggleLabel}
        size={size}
        onCheckedChange={(val) => field.onChange(val)}
      />
    </FormItem>
  );
}

export default ToggleField;
