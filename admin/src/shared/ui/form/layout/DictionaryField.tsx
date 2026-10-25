import { useCallback } from 'react';
import { useFormField } from '../hooks/useFormField';
import FormItem from '../FormItem';
import Input from '@/shared/ui/inputs/Input';
import Button from '@/shared/ui/actions/Button';
import { SystemIcon } from '@/shared/ui/icons/Icons';

interface DictionaryEntry {
  key: string;
  value: string;
}

export interface DictionaryFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/**
 * Dynamic key-value map field.
 * Value stored as `Record<string, string>` — each row has a key + value input.
 */
function DictionaryField({
  name,
  label,
  required,
  description,
  disabled,
  className,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
}: DictionaryFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;

  const dict = (field.value ?? {}) as Record<string, string>;
  const entries: DictionaryEntry[] = Object.entries(dict).map(([key, value]) => ({ key, value }));

  const updateDict = useCallback(
    (next: DictionaryEntry[]) => {
      const obj: Record<string, string> = {};
      next.forEach(({ key, value }) => {
        if (key) obj[key] = value;
      });
      field.onChange(obj);
    },
    [field],
  );

  const addRow = () => updateDict([...entries, { key: '', value: '' }]);

  const updateRow = (index: number, patch: Partial<DictionaryEntry>) => {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    updateDict(next);
  };

  const removeRow = (index: number) => {
    updateDict(entries.filter((_, i) => i !== index));
  };

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <div className="flex flex-col gap-1">
          {entries.map((e) => (
            <span key={e.key} className="text-body-14 text-fg-1">
              <span className="text-fg-4">{e.key}:</span> {e.value}
            </span>
          ))}
          {entries.length === 0 && <span className="text-body-14 text-fg-4">—</span>}
        </div>
      </FormItem>
    );
  }

  return (
    <FormItem
      className={className}
      description={description}
      error={error}
      label={label}
      required={required}
    >
      <div className="flex flex-col gap-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              disabled={disabled}
              placeholder={keyPlaceholder}
              value={entry.key}
              wrapperClassName="flex-1"
              onChange={(e) => updateRow(i, { key: e.target.value })}
            />
            <Input
              disabled={disabled}
              placeholder={valuePlaceholder}
              value={entry.value}
              wrapperClassName="flex-1"
              onChange={(e) => updateRow(i, { value: e.target.value })}
            />
            <button
              aria-label={`Xoá dòng ${entry.key || i + 1}`}
              className="text-fg-4 hover:text-error transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
              disabled={disabled}
              title="Xoá dòng"
              type="button"
              onClick={() => removeRow(i)}
            >
              <SystemIcon name="xmark-outline" size={16} />
            </button>
          </div>
        ))}
        {/* `self-start` — nút nằm cuối một `flex-col` nên mặc định bị kéo dài
            bằng cả trình soạn (đo được 466px). Nút thêm dòng phải rộng đúng
            bằng chữ của nó, nếu không nó đọc ra ngang hàng với vùng nhập. */}
        <Button
          className="self-start"
          disabled={disabled}
          size="sm"
          type="button"
          variant="stroke"
          onClick={addRow}
        >
          <SystemIcon className="mr-1" name="plus-outline" size={14} /> Thêm thuộc tính
        </Button>
      </div>
    </FormItem>
  );
}

export default DictionaryField;
