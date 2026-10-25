import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import MultiSelect, {
  type MultiSelectOption,
  type MultiSelectSize,
} from '@/shared/ui/selects/MultiSelect';

export interface MultiSelectFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  options: MultiSelectOption[];
  searchable?: boolean;
  size?: MultiSelectSize;
  maxDisplay?: number;
  /** Hiện dòng "Chọn tất cả" đầu dropdown — xem `MultiSelect.selectAll`. */
  selectAll?: boolean;
  selectAllLabel?: string;
}

/** Pre-wired multi-select dropdown powered by kit2 MultiSelect. */
function MultiSelectField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  options,
  searchable,
  size,
  maxDisplay,
  selectAll,
  selectAllLabel,
}: MultiSelectFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const selectedValues = (field.value as string[] | undefined) ?? [];

  if (readOnly) {
    const labels = options
      .filter((o) => selectedValues.includes(o.value))
      .map((o) => o.label)
      .join(', ');
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{labels || '—'}</span>
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
      <MultiSelect
        {...a11y.trigger}
        disabled={disabled}
        invalid={Boolean(error)}
        maxDisplay={maxDisplay}
        options={options}
        placeholder={placeholder}
        searchable={searchable}
        selectAll={selectAll}
        selectAllLabel={selectAllLabel}
        size={size}
        value={selectedValues}
        onValueChange={(vals) => field.onChange(vals)}
      />
    </FormItem>
  );
}

export default MultiSelectField;
