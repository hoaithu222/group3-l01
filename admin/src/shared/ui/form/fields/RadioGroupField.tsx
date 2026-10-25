import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Radio, { RadioGroup } from '@/shared/ui/inputs/Radio';
import { cn } from '@/shared/utils/style/cn';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
  options: RadioOption[];
  orientation?: 'vertical' | 'horizontal';
}

/** Pre-wired radio button group. */
function RadioGroupField({
  name,
  label,
  required,
  description,
  disabled,
  className,
  options,
  orientation = 'vertical',
}: RadioGroupFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const selected = options.find((o) => o.value === field.value);

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{selected?.label ?? '—'}</span>
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
      <RadioGroup
        {...a11y.trigger}
        className={cn('flex gap-3', orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap')}
        disabled={disabled}
        value={field.value as string | undefined}
        onValueChange={(val) => field.onChange(val)}
      >
        {options.map((opt) => (
          <Radio key={opt.value} disabled={opt.disabled} label={opt.label} value={opt.value} />
        ))}
      </RadioGroup>
    </FormItem>
  );
}

export default RadioGroupField;
