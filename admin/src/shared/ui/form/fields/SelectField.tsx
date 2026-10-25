import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import Dropdown, {
  type DropdownOption,
  type DropdownVariant,
  type DropdownSize,
} from '@/shared/ui/selects/Dropdown';

export interface SelectFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  options: DropdownOption[];
  searchable?: boolean;
  /** Placeholder cho ô tìm kiếm (khi `searchable`). */
  searchPlaceholder?: string;
  /** Cho phép tạo giá trị mới từ ô tìm kiếm (combobox). */
  creatable?: boolean;
  /** Hiện nút xoá lựa chọn. */
  clearable?: boolean;
  variant?: DropdownVariant;
  size?: DropdownSize;
  /**
   * Class cho PANEL thả xuống. Cần khi option có `meta` dài: panel không có
   * trần bề rộng nên nó nở đúng bằng option rộng nhất — ghim `w-*`/`max-w-*`
   * ở đây để giới hạn lại.
   */
  contentClassName?: string;
  /**
   * Class cho cột `meta` của option — mặc định `meta` KHÔNG co và KHÔNG cắt, nên
   * muốn cắt "…" phải tự ghim bề rộng (vd `w-[280px] truncate`).
   */
  metaClassName?: string;
}

/** Pre-wired single-select dropdown powered by the kit2 Dropdown component. */
function SelectField({
  name,
  label,
  required,
  description,
  placeholder,
  disabled,
  className,
  options,
  searchable,
  searchPlaceholder,
  creatable,
  clearable,
  variant,
  size,
  contentClassName,
  metaClassName,
}: SelectFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  // Đồng bộ kiểu SỐ/CHUỖI tại biên form → Radix. `DropdownOption.value` là string, và Radix Select
  // so khớp bằng `===` — form cầm số 5 (vd prefill từ API trả number) thì không bao giờ khớp option
  // '5': ô lặng lẽ rơi về placeholder dù giá trị đang đúng. Ép về chuỗi ở đây là mọi form dùng
  // SelectField đều an toàn, không phải nhớ String() ở từng mapper.
  // GIỮ NGUYÊN chuỗi rỗng (String('') === ''): nhiều bộ lọc dùng option `{ value: '' }` làm "Tất cả"
  // — Dropdown có sẵn EMPTY_SENTINEL cho đúng ca này, đổi '' thành undefined là hỏng chúng.
  const value = field.value == null ? undefined : String(field.value);

  if (readOnly) {
    const selectedLabel = options.find((o) => o.value === value)?.label ?? '—';
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-1 py-2">{selectedLabel}</span>
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
      <Dropdown
        {...a11y.trigger}
        clearable={clearable}
        contentClassName={contentClassName}
        creatable={creatable}
        disabled={disabled}
        invalid={Boolean(error)}
        metaClassName={metaClassName}
        options={options}
        placeholder={placeholder}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        size={size}
        value={value}
        variant={variant}
        onValueChange={(val) => field.onChange(val)}
      />
    </FormItem>
  );
}

export default SelectField;
