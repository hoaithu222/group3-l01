import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Textarea, { type TextareaSize } from '@/shared/ui/inputs/Textarea';

export interface TextareaFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  minHeight?: number | string;
  /** Min-height preset (sm=32 / md=36 / lg=40). Overridden by `minHeight`. */
  size?: TextareaSize;
}

/** Pre-wired multi-line textarea. Shows char counter when maxLength is set. */
function TextareaField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  rows,
  maxLength,
  showCount,
  minHeight,
  size,
}: TextareaFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2 whitespace-pre-wrap">
          {String(field.value ?? '—')}
        </span>
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
      <Textarea
        {...field}
        {...a11y.input}
        disabled={disabled}
        invalid={Boolean(error)}
        maxLength={maxLength}
        minHeight={minHeight}
        placeholder={placeholder}
        rows={rows}
        showCount={showCount}
        size={size}
      />
    </FormItem>
  );
}

export default TextareaField;
