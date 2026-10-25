import { useCallback, useState } from 'react';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import TimePicker from '@/shared/ui/pickers/TimePicker';
import type { TimePickerSize } from '@/shared/ui/pickers/TimePicker';

export interface TimeFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: TimePickerSize;
  /** Bước phút trong danh sách (mặc định 1). */
  minuteStep?: number;
  /** Cho phép gõ giờ trực tiếp vào ô. Mặc định true. */
  allowManualInput?: boolean;
  /** Số ms ngừng gõ thì tự validate + lưu. Mặc định 500. `0` = chỉ chốt bằng Enter / rời ô. */
  commitDelay?: number;
}

/** Pre-wired time picker. Value stored as "HH:mm" string. */
function TimeField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  size,
  minuteStep,
  allowManualInput,
  commitDelay,
}: TimeFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  // Lỗi cú pháp khi gõ tay (vd "2400") KHÔNG đi qua schema — giá trị hỏng thì
  // TimePicker không commit, nên RHF chẳng thấy gì để mà báo. Giữ riêng ở đây
  // để người dùng biết vì sao ô đỏ mà form vẫn giữ giá trị cũ.
  const [parseError, setParseError] = useState<string | null>(null);
  const error = fieldState.error?.message ?? parseError ?? undefined;
  const a11y = useFieldA11y({ label, description, error });
  const value = (field.value as string | null | undefined) ?? '';

  const handleChange = useCallback((next: string | null) => field.onChange(next ?? ''), [field]);

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="py-2 text-body-14 text-fg-1">{value || '—'}</span>
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
      <TimePicker
        {...a11y.trigger}
        allowManualInput={allowManualInput}
        commitDelay={commitDelay}
        disabled={disabled}
        invalid={Boolean(error)}
        minuteStep={minuteStep}
        placeholder={placeholder}
        size={size}
        value={value}
        onChange={handleChange}
        onParseError={setParseError}
      />
    </FormItem>
  );
}

export default TimeField;
