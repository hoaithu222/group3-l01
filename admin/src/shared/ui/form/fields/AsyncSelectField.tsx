import { useState, useRef, useCallback } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { debounce } from '@/shared/utils/browser/debounce.utils';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import FormItem from '../FormItem';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useImeSafeSearchInput } from '@/shared/hooks';
import { cn } from '@/shared/utils/style/cn';
import type { FieldSize } from '../form.types';
import { FIELD_HEIGHT, fieldSurface } from '@/shared/ui/inputs/field.theme';

export interface AsyncOption {
  value: string;
  label: string;
}

export interface AsyncSelectFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  fetchOptions: (search: string) => Promise<AsyncOption[]>;
  debounceMs?: number;
  /** Height preset (sm=32 / md=36 / lg=40). Default: md. */
  size?: FieldSize;
}

/** Bố cục riêng của nút mở panel; khung/nền/focus lấy từ `fieldSurface`. */
const TRIGGER_LAYOUT = [
  'inline-flex items-center justify-between gap-2 px-3 cursor-pointer',
  'text-body-14 text-left',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const CONTENT_CN = [
  'z-50 min-w-[var(--radix-popover-trigger-width)] overflow-hidden',
  // Figma: solid popup bg, border subtle.
  'border border-border-1',
  'bg-bg-popup backdrop-blur-[20px]',
  'shadow-[0_4px_20px_var(--color-popup-shadow)]',
].join(' ');

/** Single-select dropdown that fetches options from an API with debounced search. */
function AsyncSelectField({
  name,
  label,
  required,
  description,
  placeholder = 'Tìm kiếm...',
  disabled,
  className,
  fetchOptions,
  debounceMs = 300,
  size = 'md',
}: AsyncSelectFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<AsyncOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');

  const loadRef = useRef(
    debounce(async (q: string) => {
      setLoading(true);
      try {
        setOptions(await fetchOptions(q));
      } finally {
        setLoading(false);
      }
    }, debounceMs),
  );

  const handleSearchChange = useCallback((next: string) => {
    setSearch(next);
    loadRef.current(next);
  }, []);

  // Uncontrolled + composition-aware → gõ tiếng Việt không mất dấu.
  // Xem `docs/rules/ime-safe-input.md`.
  const { inputProps } = useImeSafeSearchInput(search, handleSearchChange);

  const handleOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && !search) loadRef.current('');
    },
    [search],
  );

  const handleSelect = useCallback(
    (opt: AsyncOption) => {
      field.onChange(opt.value);
      setSelectedLabel(opt.label);
      setOpen(false);
      setSearch('');
    },
    [field],
  );

  if (readOnly) {
    return (
      <FormItem className={className} label={label}>
        <span className="text-body-14 text-fg-on-popup py-2">
          {selectedLabel || String(field.value ?? '—')}
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
      label={label}
      required={required}
    >
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpen}>
        <PopoverPrimitive.Trigger
          {...a11y.trigger}
          className={cn(
            fieldSurface({ focusMode: 'trigger', invalid: Boolean(error) }),
            TRIGGER_LAYOUT,
            FIELD_HEIGHT[size],
          )}
          disabled={disabled}
        >
          <span className={field.value ? 'text-fg-on-popup' : 'text-fg-on-popup-muted'}>
            {field.value ? selectedLabel || String(field.value) : placeholder}
          </span>
          <SystemIcon
            className="size-5 text-fg-on-popup-muted shrink-0"
            name="angle-down-outline"
          />
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            className={CONTENT_CN}
            side="bottom"
            sideOffset={4}
          >
            <div
              className="flex items-center gap-3 px-3 py-2.5 border-b border-nav-divider"
              onKeyDown={(e) => e.stopPropagation()}
            >
              <SystemIcon
                className="size-5 shrink-0 text-fg-on-popup-muted"
                name="magnifying-glass-outline"
              />
              <input
                {...inputProps}
                autoFocus
                className="flex-1 bg-transparent outline-none text-body-14 text-fg-on-popup placeholder:text-fg-on-popup-muted"
                placeholder="Tìm kiếm..."
                type="text"
              />
              {loading && (
                <SystemIcon
                  className="size-4 text-fg-on-popup-muted animate-spin"
                  name="arrows-rotate-outline"
                />
              )}
            </div>

            <div className="max-h-[280px] overflow-auto">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  className="flex w-full cursor-pointer items-center px-3 py-2.5 text-body-14 text-fg-on-popup hover:bg-nav-hover-bg text-left"
                  type="button"
                  onClick={() => handleSelect(opt)}
                >
                  {opt.label}
                </button>
              ))}
              {!loading && options.length === 0 && (
                <p className="px-3 py-2.5 text-body-14 text-fg-on-popup-muted">Không có kết quả</p>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </FormItem>
  );
}

export default AsyncSelectField;
