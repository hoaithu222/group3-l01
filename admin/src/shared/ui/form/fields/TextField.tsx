import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Input from '@/shared/ui/inputs/Input';
import type { FieldSize } from '../form.types';

export interface TextFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'search';
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  autoFocus?: boolean;
  size?: FieldSize;
  /**
   * Chặn nhập vượt độ dài ngay tại trình duyệt. BẮT BUỘC đặt bằng giá trị Zod
   * `.max()` của cùng field — Zod chỉ báo lỗi SAU khi
   * người dùng đã gõ thừa, `maxLength` không cho gõ thừa ngay từ đầu.
   */
  maxLength?: number;
}

/**
 * Pre-wired text input — connects to the parent `<Form>` via RHF context.
 * Renders a read-only `<span>` when the form is in `readOnly` mode.
 */
function TextField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  type = 'text',
  startIcon,
  endIcon,
  autoFocus,
  size,
  maxLength,
}: TextFieldProps) {
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
        autoFocus={autoFocus}
        disabled={disabled}
        endIcon={endIcon}
        invalid={Boolean(error)}
        maxLength={maxLength}
        placeholder={placeholder}
        size={size}
        startIcon={startIcon}
        type={type}
      />
    </FormItem>
  );
}

export default TextField;
