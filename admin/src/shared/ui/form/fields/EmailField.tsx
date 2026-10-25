import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Input from '@/shared/ui/inputs/Input';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { FieldSize } from '../form.types';

export interface EmailFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  size?: FieldSize;
  /** Show mail icon in leading slot. Default true. */
  showIcon?: boolean;
}

/**
 * Pre-wired email input.
 * - `type="email"` (browser mobile keyboard + basic validation).
 * - `autoComplete="email"` (browser autofill).
 * - `spellCheck={false}` (không gạch chân đỏ).
 * - `inputMode="email"` (mobile keyboard).
 *
 * Validation qua Zod schema — dùng `emailField()` từ `@/shared/utils/validators.utils`.
 */
function EmailField({
  name,
  label,
  required,
  description,
  placeholder = 'email@domain.com',
  disabled,
  className,
  autoFocus,
  size,
  showIcon = true,
}: EmailFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{String(field.value ?? '—')}</span>
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
      <Input
        {...field}
        {...a11y.input}
        autoComplete="email"
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode="email"
        invalid={Boolean(error)}
        maxLength={254}
        placeholder={placeholder}
        size={size}
        spellCheck={false}
        startIcon={showIcon ? <SystemIcon name="envelope-outline" size={16} /> : undefined}
        type="email"
      />
    </FormItem>
  );
}

export default EmailField;
