import { useState } from 'react';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem, { type ErrorColor } from '../FormItem';
import PasswordStrength from '../PasswordStrength';
import type { PasswordCondition } from '../password-strength.helpers';
import Input, { type InputProps } from '@/shared/ui/inputs/Input';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { FieldSize } from '../form.types';

export interface PasswordFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  /** Show "(Tùy chọn)" hint after label. Ignored when `required`. */
  optional?: boolean;
  /** Custom optional label text. Default: "(Tùy chọn)". */
  optionalLabel?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  /**
   * Gợi ý cho trình duyệt / trình quản lý mật khẩu (WCAG 1.3.5). Ô mật khẩu MỚI phải khai
   * `new-password` — nếu không, trình duyệt điền mật khẩu CŨ đã lưu vào đó; ô đăng nhập
   * khai `current-password`. Bỏ trống = để trình duyệt tự đoán.
   */
  autoComplete?: 'current-password' | 'new-password' | 'off';
  /** Color token for error message + required asterisk. Default: 'error'. */
  errorColor?: ErrorColor;
  /** Input style variant. Default: 'glass'. */
  variant?: InputProps['variant'];
  /** Height preset (sm=32 / md=36 / lg=40). Default: md. */
  size?: FieldSize;
  /** Show password strength indicator below input (Figma 187:24299). */
  showStrength?: boolean;
  /** Override strength conditions. Default: uppercase / number / 8+ chars. */
  strengthConditions?: PasswordCondition[];
}

/** Password input with eye-toggle visibility + optional strength meter. */
function PasswordField({
  name,
  label,
  required,
  optional,
  optionalLabel,
  description,
  placeholder = '••••••••',
  disabled,
  className,
  autoFocus,
  autoComplete,
  errorColor,
  variant,
  size,
  showStrength,
  strengthConditions,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">••••••••</span>
      </FormItem>
    );
  }

  return (
    <FormItem
      {...a11y.item}
      className={className}
      description={description}
      error={error}
      errorColor={errorColor}
      htmlFor={a11y.id}
      label={label}
      optional={optional}
      optionalLabel={optionalLabel}
      required={required}
    >
      <Input
        {...field}
        {...a11y.input}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        endIcon={
          <button
            aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="inline-flex items-center justify-center text-fg-3 hover:text-fg-1 transition-colors cursor-pointer"
            tabIndex={-1}
            type="button"
            onClick={() => setVisible((v) => !v)}
          >
            <SystemIcon name={visible ? 'eye-slash-outline' : 'eye-outline'} size={16} />
          </button>
        }
        invalid={Boolean(error)}
        placeholder={placeholder}
        size={size}
        type={visible ? 'text' : 'password'}
        variant={variant}
      />
      {showStrength && (
        <PasswordStrength conditions={strengthConditions} value={field.value ?? ''} />
      )}
    </FormItem>
  );
}

export default PasswordField;
