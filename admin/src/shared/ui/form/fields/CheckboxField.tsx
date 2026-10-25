import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Checkbox from '@/shared/ui/inputs/Checkbox';

export interface CheckboxFieldProps {
  name: string;
  label?: string;
  /** Text shown next to the checkbox box itself. */
  checkboxLabel?: React.ReactNode;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Single checkbox field.
 * - `label` = field label above the checkbox (optional)
 * - `checkboxLabel` = text beside the checkbox box
 *
 * ⚠️ Truyền CẢ HAI thì ô có hai nhãn: nhãn của `FormItem` (nối bằng `htmlFor`)
 * và `<label>` mà `Checkbox` tự bọc quanh ô. Tên trợ năng khi đó là chuỗi NỐI
 * của hai nhãn — muốn tên gọn thì chọn một trong hai. Hành vi này cố ý giữ
 * nguyên: cả hai nhãn đều có thật trên màn, giấu một cái đi mới là nói dối.
 */
function CheckboxField({
  name,
  label,
  checkboxLabel,
  required,
  description,
  disabled,
  className,
}: CheckboxFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const checked = Boolean(field.value);

  // Destructure before JSX to satisfy react-hooks/refs linter (refs must not be
  // accessed inline inside JSX in React Compiler mode).
  const { onBlur, onChange } = field;

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{checked ? 'Có' : 'Không'}</span>
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
      <Checkbox
        {...a11y.input}
        checked={checked}
        disabled={disabled}
        label={checkboxLabel}
        onBlur={onBlur}
        onCheckedChange={(val) => onChange(Boolean(val))}
      />
    </FormItem>
  );
}

export default CheckboxField;
