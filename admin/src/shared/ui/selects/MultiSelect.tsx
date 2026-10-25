import { forwardRef, useMemo, useState, useCallback } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDebounce, useImeSafeSearchInput } from '@/shared/hooks';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { includesNormalized, normalizeSearch } from '@/shared/utils/format/string.utils';
import { tv, type VariantProps } from 'tailwind-variants';
import {
  FIELD_ICON_CLASS,
  FIELD_POPUP_CLASS,
  FIELD_POPUP_ITEM_CLASS,
  fieldSurface,
  FIELD_CLEAR_ICON,
} from '@/shared/ui/inputs/field.theme';
import Checkbox from '@/shared/ui/inputs/Checkbox';
import Badge from '@/shared/ui/primitives/Badge';

/**
 * MultiSelect — multi-value dropdown powered by Radix Popover + kit2 Checkbox.
 *
 * Radix Select doesn't support multi-select; we use Popover for positioning +
 * dismiss + focus management, then render checkboxes for selection state.
 *
 * Size axis (kit2 form standard) — sets the *minimum* height (trigger grows
 * with chips when many values are selected):
 *   - `sm` → 32px (min-h-8)
 *   - `md` → 36px (min-h-9, default)
 *   - `lg` → 40px (min-h-10)
 */
export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const styles = tv(
  {
    slots: {
      // CHỈ layout/typography — viền, nền, hover, focus, ring do `fieldSurface`
      // (variant `invalid` bên dưới) lo, dùng chung với Dropdown / PickerTrigger.
      trigger: [
        'inline-flex items-center justify-between gap-2 w-full min-w-[180px] cursor-pointer',
        'px-3 py-1 text-body-14 text-fg-1 text-left',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ],
      content: [FIELD_POPUP_CLASS, 'min-w-[var(--radix-popover-trigger-width)]'],
      search: 'flex items-center gap-3 px-3 py-2.5 border-b border-nav-divider',
      searchInput:
        'flex-1 bg-transparent outline-none text-body-14 text-fg-on-popup placeholder:text-fg-on-popup-muted',
      item: [
        FIELD_POPUP_ITEM_CLASS,
        'w-full',
        // Đây là <label> thường, KHÔNG phải Radix Item nên không có
        // `data-highlighted` → ánh xạ hover sang đúng treatment của panel dùng
        // chung (nền + thanh accent trái trượt ra).
        'hover:bg-nav-hover-bg hover:before:scale-y-100',
        'data-[disabled]:hover:bg-transparent data-[disabled]:hover:before:scale-y-0',
      ],
    },
    variants: {
      // GIỮ min-h (không phải h-) — trigger phải cao thêm khi chip xuống dòng.
      size: {
        sm: { trigger: 'min-h-8' },
        md: { trigger: 'min-h-9' },
        lg: { trigger: 'min-h-10' },
      },
      // Bề mặt dùng chung: `focus-visible` VÀ `data-[state=open]` cùng cho ra
      // viền primary + ring 2px (đỏ khi invalid). Nhánh `false` bắt buộc phải có.
      invalid: {
        true: { trigger: fieldSurface({ focusMode: 'trigger', invalid: true }) },
        false: { trigger: fieldSurface({ focusMode: 'trigger', invalid: false }) },
      },
    },
    defaultVariants: {
      size: 'md',
      invalid: false,
    },
  },
  {
    // tv() có twMerge RIÊNG → dạy nó `text-body-14` (từ FIELD_POPUP_ITEM_CLASS)
    // là font-size chứ không phải màu. Xem `cn.ts`.
    twMergeConfig: twMergeFontExtend,
  },
);

type MultiSelectVariants = VariantProps<typeof styles>;
export type MultiSelectSize = NonNullable<MultiSelectVariants['size']>;

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  /** Độ trễ lọc khi gõ tìm kiếm, ms. Mặc định 300 — khớp `Dropdown`. */
  searchDebounce?: number;
  disabled?: boolean;
  size?: MultiSelectSize;
  className?: string;
  contentClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Max chips to show inline — excess shows as "+N". Undefined = show all (wrap). */
  maxDisplay?: number;
  /**
   * Luôn hiển thị `placeholder` ở trigger, KHÔNG render chip đã chọn (mục đã
   * chọn được liệt kê ở nơi khác). Dropdown vẫn tick đúng `value`.
   */
  hideChips?: boolean;
  /** Placeholder ô tìm kiếm (khi `searchable`). */
  searchPlaceholder?: string;
  /** Hiện nút xoá (X) ở trigger để bỏ chọn tất cả khi đang có lựa chọn. */
  clearable?: boolean;
  /** Error state — chuyển border sang màu error. */
  invalid?: boolean;
  /**
   * Hiện dòng "Chọn tất cả" ở đầu dropdown (checkbox 3 trạng thái).
   * Khi đang tìm kiếm, chỉ tác động lên các mục ĐANG HIỂN THỊ — không đụng tới
   * mục đã chọn nhưng bị filter ẩn đi (nếu không, gõ tìm rồi bấm chọn-tất-cả sẽ
   * âm thầm bỏ chọn những mục ngoài bộ lọc).
   */
  selectAll?: boolean;
  /** Nhãn dòng chọn tất cả. */
  selectAllLabel?: string;
  /** Mở sẵn dropdown khi mount (uncontrolled) — vd bật edit inline bằng double-click. */
  defaultOpen?: boolean;
  /**
   * Điều khiển đóng/mở TỪ NGOÀI (controlled). Dùng khi caller cần tự đóng dropdown
   * — vd ô trong bảng: chọn xong nhấn Enter là đóng. Bỏ trống → uncontrolled như cũ.
   */
  open?: boolean;
  /** Theo dõi đóng/mở dropdown — vd đóng → thoát chế độ sửa inline. */
  onOpenChange?: (open: boolean) => void;
  /**
   * ── Trợ năng: nối với nhãn nằm NGOÀI component ────────────────────────────
   * Phần tử tương tác ở đây là `<button>` / `<div>`, không phải `<input>` thật,
   * nên `<label htmlFor>` một mình không đủ để trình đọc màn hình đọc ra tên ô.
   * Nơi dùng (vd các `*Field` của kit2 form) truyền `aria-labelledby` trỏ vào id
   * của nhãn. Tất cả đều OPTIONAL — không truyền thì hành vi y hệt trước đây.
   */
  id?: string;
  /** Tên truy cập TRỰC TIẾP khi không có nhãn hiển thị (bộ lọc trên thanh công cụ) — xem `Dropdown`. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const MultiSelect = forwardRef<HTMLButtonElement, MultiSelectProps>(
  (
    {
      options,
      value = [],
      onValueChange,
      placeholder = 'Chọn',
      searchable = false,
      searchDebounce = 300,
      disabled,
      size,
      className,
      contentClassName,
      side = 'bottom',
      align = 'start',
      maxDisplay,
      hideChips = false,
      searchPlaceholder = 'Tìm kiếm...',
      clearable = false,
      invalid,
      selectAll = false,
      selectAllLabel = 'Chọn tất cả',
      defaultOpen,
      open,
      onOpenChange,
      id,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
    },
    ref,
  ) => {
    const [search, setSearch] = useState('');
    // IME-safe uncontrolled input để không phá composition tiếng Việt/CJK.
    const { inputProps: searchInputProps } = useImeSafeSearchInput(search, setSearch);
    // Lọc trên chuỗi ĐÃ hoãn, giống `Dropdown`: ô nhập vẫn phản hồi tức thì
    // (nó không controlled), còn phép lọc toàn danh sách chỉ chạy khi người dùng
    // ngừng gõ.
    const debouncedSearch = useDebounce(search, searchDebounce);
    const slots = styles({ size, invalid });

    // Popover để non-modal (tránh 2 lớp modal Radix lồng nhau khi ở trong Dialog
    // → click ra ngoài lần đầu bị nuốt, phải bấm 2 lần mới đóng). Đổi lại: khi ở
    // trong Dialog (react-remove-scroll khoá wheel ngoài), tự xử lý lăn chuột cho
    // danh sách bằng listener non-passive. Ref callback (React 19) trả cleanup.
    const attachWheelScroll = useCallback((node: HTMLDivElement | null) => {
      if (!node) return;
      const onWheel = (event: WheelEvent) => {
        node.scrollTop += event.deltaY;
        event.preventDefault();
      };
      node.addEventListener('wheel', onWheel, { passive: false });
      return () => node.removeEventListener('wheel', onWheel);
    }, []);

    const filteredOptions = useMemo(() => {
      // Diacritic-insensitive: gõ "nguyen" khớp "Nguyễn", "hoa" khớp "Hoà"…
      const query = searchable ? normalizeSearch(debouncedSearch) : '';
      if (!query) return options;
      return options.filter((option) => includesNormalized(option.label, query));
    }, [options, searchable, debouncedSearch]);

    // Lookup theo value, giữ đúng thứ tự options để chip hiển thị nhất quán
    const selectedOptions = useMemo(
      () => options.filter((option) => value.includes(option.value)),
      [options, value],
    );

    const toggle = useCallback(
      (optionValue: string, isChecked: boolean) => {
        onValueChange?.(
          isChecked ? [...value, optionValue] : value.filter((v) => v !== optionValue),
        );
      },
      [value, onValueChange],
    );

    // Slice theo maxDisplay — undefined = show all
    const visibleSelected = useMemo(
      () => (maxDisplay != null ? selectedOptions.slice(0, maxDisplay) : selectedOptions),
      [selectedOptions, maxDisplay],
    );
    const overflowCount = maxDisplay != null ? Math.max(0, selectedOptions.length - maxDisplay) : 0;

    // Extract maps ra biến — React Compiler tự memoize JSX rendering
    const chipElements = useMemo(
      () =>
        visibleSelected.map((option) => (
          <Badge
            key={option.value}
            // `min-w-0` + nhãn `truncate` bên trong: chip HẸP hơn nội dung thì
            // cắt "…" chứ KHÔNG ngắt chữ xuống dòng — chữ gãy dòng làm chip cao
            // gấp đôi và đẩy cả ô select cao theo (`min-h` của trigger chỉ là
            // sàn). Thấy rõ nhất ở chế độ `maxDisplay` (hàng chip `flex-nowrap`).
            className="min-w-0 max-w-full"
            color="primary"
            endIcon={
              // <span> (không phải <button>) — tránh nested interactive trong trigger button.
              // stopPropagation chặn Radix Popover toggle khi xoá chip.
              // `shrink-0`: nút xoá phải luôn còn nguyên, phần bị cắt là nhãn.
              <span
                aria-label={`Bỏ chọn ${option.label}`}
                className="inline-flex shrink-0 p-1 rounded-full bg-neutral-7/60 items-center justify-center cursor-pointer hover:text-primary-7"
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  toggle(option.value, false);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <SystemIcon name="xmark-outline" size={FIELD_CLEAR_ICON.chip} />
              </span>
            }
            variant="tinted"
          >
            <span className="truncate">{option.label}</span>
          </Badge>
        )),
      [visibleSelected, toggle],
    );

    // ── Chọn tất cả ─────────────────────────────────────────────────────────
    // Phạm vi = `filteredOptions` (mục đang hiển thị), KHÔNG phải `options`:
    // đang lọc mà bấm chọn-tất-cả thì chỉ áp cho kết quả lọc, giữ nguyên lựa
    // chọn nằm ngoài bộ lọc. Bỏ qua mục `disabled`.
    const selectableValues = useMemo(
      () => filteredOptions.filter((o) => !o.disabled).map((o) => o.value),
      [filteredOptions],
    );
    const selectedInScope = useMemo(
      () => selectableValues.filter((v) => value.includes(v)).length,
      [selectableValues, value],
    );
    const allSelected = selectableValues.length > 0 && selectedInScope === selectableValues.length;
    const someSelected = selectedInScope > 0 && !allSelected;

    const toggleAll = useCallback(
      (nextChecked: boolean) => {
        onValueChange?.(
          nextChecked
            ? // Union — giữ lựa chọn ngoài bộ lọc hiện tại.
              [...value, ...selectableValues.filter((v) => !value.includes(v))]
            : value.filter((v) => !selectableValues.includes(v)),
        );
      },
      [value, selectableValues, onValueChange],
    );

    const optionElements = filteredOptions.map((option) => (
      <label
        key={option.value}
        className={slots.item()}
        data-disabled={option.disabled || undefined}
      >
        <Checkbox
          checked={value.includes(option.value)}
          disabled={option.disabled}
          label={option.label}
          size="sm"
          onCheckedChange={(nextChecked) => toggle(option.value, nextChecked === true)}
        />
      </label>
    ));

    return (
      // Non-modal — KHÔNG lồng modal Radix trong Dialog (fix double-click khi đóng).
      // Wheel scroll trong dropdown được xử lý thủ công qua `attachWheelScroll`.
      <PopoverPrimitive.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
        <PopoverPrimitive.Trigger
          ref={ref}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid ?? (invalid || undefined)}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={slots.trigger({ class: className })}
          disabled={disabled}
          id={id}
        >
          {hideChips || selectedOptions.length === 0 ? (
            <span className="flex-1 truncate text-fg-4">{placeholder}</span>
          ) : (
            <div
              className={
                maxDisplay != null
                  ? 'flex flex-nowrap gap-1 items-center flex-1 min-w-0 overflow-hidden'
                  : 'flex flex-wrap gap-1 items-center flex-1 min-w-0'
              }
            >
              {chipElements}
              {overflowCount > 0 && (
                <Badge className="shrink-0" color="neutral" variant="tinted">
                  +{overflowCount}
                </Badge>
              )}
            </div>
          )}
          {clearable && value.length > 0 && (
            // <span> (không phải <button>) — tránh nested interactive trong trigger.
            // stopPropagation chặn Radix Popover toggle khi xoá.
            <span
              aria-label="Bỏ chọn tất cả"
              className="inline-flex shrink-0 cursor-pointer items-center justify-center self-center text-fg-4 hover:text-fg-2"
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onValueChange?.([]);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SystemIcon name="xmark-outline" size={FIELD_CLEAR_ICON.all} />
            </span>
          )}
          <SystemIcon
            className={cn(FIELD_ICON_CLASS, 'self-center')}
            name="angle-down-outline"
            size={10}
          />
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align={align}
            className={slots.content({ class: contentClassName })}
            side={side}
            sideOffset={4}
          >
            {searchable && (
              <div className={slots.search()}>
                <SystemIcon
                  className="size-5 shrink-0 text-fg-on-popup-muted"
                  name="magnifying-glass-outline"
                />
                <input
                  {...searchInputProps}
                  className={slots.searchInput()}
                  placeholder={searchPlaceholder}
                  type="text"
                />
              </div>
            )}

            {selectAll && filteredOptions.length > 0 && (
              <label className={cn(slots.item(), 'border-b border-nav-divider')}>
                <Checkbox
                  // Kit2 Checkbox nhận `'indeterminate'` qua chính `checked`
                  // (DOM property, không có attribute HTML tương ứng).
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  label={`${selectAllLabel} (${selectableValues.length})`}
                  size="sm"
                  onCheckedChange={(next) => toggleAll(next === true)}
                />
              </label>
            )}

            <div ref={attachWheelScroll} className="max-h-[300px] overflow-auto">
              {optionElements}

              {filteredOptions.length === 0 && (
                <div className="px-3 py-2.5 text-body-14 text-fg-on-popup-muted">
                  Không có kết quả
                </div>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);

MultiSelect.displayName = 'MultiSelect';

export default MultiSelect;
