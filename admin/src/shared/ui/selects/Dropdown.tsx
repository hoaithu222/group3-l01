import { memo, useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';
import Badge from '@/shared/ui/primitives/Badge';
import { useDebounce, useImeSafeSearchInput } from '@/shared/hooks';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { includesNormalized, normalizeSearch } from '@/shared/utils/format/string.utils';
import { tv, type VariantProps } from 'tailwind-variants';
import {
  FIELD_HEIGHT,
  FIELD_ICON_CLASS,
  FIELD_POPUP_CLASS,
  FIELD_POPUP_ITEM_CLASS,
  fieldSurface,
  FIELD_CLEAR_ICON,
} from '@/shared/ui/inputs/field.theme';

/**
 * Dropdown — single-select powered by Radix Select.
 *
 * Variants (visual indicator only — semantics identical):
 *   - "tick"  → trailing check mark (default, Figma "Tick")
 *   - "radio" → trailing radio ring (Figma "Radio")
 *
 * Size axis (kit2 form standard):
 *   - `sm` → 32px (h-8)
 *   - `md` → 36px (h-9, default)
 *   - `lg` → 40px (h-10)
 *
 * For action menus (no selection) use `Menu`.
 * For multi-select use `MultiSelect`.
 */
export type DropdownVariant = 'tick' | 'radio';

/** Sắc thái màu semantic cho option (vd mức độ vi phạm: Nhẹ/Trung bình/Nghiêm trọng). */
export type DropdownOptionTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Icon đứng trước nhãn (vd "location-dot-outline"). */
  icon?: SystemIconName;
  /** Nhãn pill ngắn đứng trước label (vd mã đơn vị tính "m"). */
  badge?: string;
  /**
   * Text phụ căn PHẢI trong item (vd ngày, mã, số lượng). Label bị cắt (…) khi
   * dài để meta luôn đọc được. KHÔNG hiện trên trigger — chỉ trong danh sách.
   */
  meta?: string;
  /** Tô màu semantic cho option: chữ + check + nền tint khi được chọn (Figma severity). */
  tone?: DropdownOptionTone;
  /**
   * Chấm màu DỮ LIỆU đứng trước nhãn — màu do người dùng cấu hình chứ không phải
   * token thiết kế (vd màu nhận diện nhà thầu). Nhận CSS color đã sẵn sàng dùng
   * (`#RRGGBB` hoặc `var(--color-*)`).
   *
   * `''` (chuỗi rỗng) = bản ghi CHƯA đặt màu → vẽ chấm RỖNG viền mờ để nhãn các
   * dòng vẫn thẳng lề nhau. `undefined` = option không có chấm.
   */
  dotColor?: string;
  /**
   * Hình của chấm dữ liệu. Mặc định `circle`.
   *
   * `square` dành cho MŨI THI CÔNG — cùng một bảng màu với nhà thầu, nên hình là
   * thứ duy nhất tách hai loại ra khi chúng đứng cạnh nhau trong cùng một dòng.
   */
  dotShape?: 'circle' | 'square';
}

/** Chấm màu dữ liệu đứng trước nhãn — dùng ở cả item trong danh sách và trigger. */
const OptionDot = memo(
  ({ color, shape = 'circle' }: { color: string; shape?: 'circle' | 'square' }) => (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 border border-border-2',
        shape === 'square' ? 'rounded-none' : 'rounded-full',
      )}
      // `style` là chỗ hợp lệ cho màu vì đây là DỮ LIỆU người dùng cấu hình.
      style={color ? { backgroundColor: color, borderColor: 'transparent' } : undefined}
    />
  ),
);

OptionDot.displayName = 'OptionDot';

/** Class theo tone: màu chữ, màu check icon, nền tint khi option đang được chọn. */
const OPTION_TONE: Record<DropdownOptionTone, { text: string; check: string; selectedBg: string }> =
  {
    primary: {
      text: 'text-primary-5',
      check: 'text-primary-5',
      selectedBg: 'data-[state=checked]:bg-primary-6/30',
    },
    success: {
      text: 'text-success-5',
      check: 'text-success-5',
      selectedBg: 'data-[state=checked]:bg-success-6/30',
    },
    warning: {
      text: 'text-warning-5',
      check: 'text-warning-5',
      selectedBg: 'data-[state=checked]:bg-warning-6/30',
    },
    error: {
      text: 'text-error-5',
      check: 'text-error-5',
      selectedBg: 'data-[state=checked]:bg-error-6/30',
    },
    info: {
      text: 'text-info-5',
      check: 'text-info-5',
      selectedBg: 'data-[state=checked]:bg-info-6/30',
    },
    neutral: {
      text: 'text-fg-3',
      check: 'text-fg-3',
      selectedBg: 'data-[state=checked]:bg-neutral-6/20',
    },
  };

const styles = tv(
  {
    slots: {
      // CHỈ layout/typography — viền, nền, hover, focus, ring do `fieldSurface`
      // (variant `invalid` bên dưới) lo, dùng chung với MultiSelect / PickerTrigger
      // / DropdownTreeSelect.
      trigger: [
        'inline-flex items-center justify-between gap-2 w-full min-w-[180px] cursor-pointer',
        'px-3 text-body-14 text-fg-1 text-left',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Radix đặt data-placeholder trên CHÍNH trigger → mute placeholder ở cả
        // trigger lẫn descendant (Value span) để placeholder không sáng như giá trị.
        '[&_[data-placeholder]]:text-fg-4 data-[placeholder]:text-fg-4',
      ],
      content: [FIELD_POPUP_CLASS, 'min-w-[var(--radix-select-trigger-width)]'],
      search: 'flex items-center gap-3 px-3 py-2.5 border-b border-nav-divider',
      searchInput:
        'flex-1 bg-transparent outline-none text-body-14 text-fg-on-popup placeholder:text-fg-on-popup-muted',
      // `group` để radioRing đọc được `group-data-[state=checked]` của Radix Item.
      item: [FIELD_POPUP_ITEM_CLASS, 'group'],
      radioRing: [
        'inline-flex items-center justify-center shrink-0 size-4 border rounded-full',
        'border-fg-on-popup-muted/50 group-data-[state=checked]:border-ring-focus',
      ],
    },
    variants: {
      size: {
        sm: { trigger: FIELD_HEIGHT.sm },
        md: { trigger: FIELD_HEIGHT.md },
        lg: { trigger: FIELD_HEIGHT.lg },
      },
      // Bề mặt dùng chung: `focus-visible` VÀ `data-[state=open]` cùng cho ra
      // viền primary + ring 2px (đỏ khi invalid). Nhánh `false` bắt buộc phải có
      // — không có nó thì trigger bình thường sẽ mất luôn viền/nền.
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
    // tv() có twMerge RIÊNG → phải dạy nó `text-body-14` (đến từ
    // FIELD_POPUP_ITEM_CLASS) là font-size chứ không phải màu, nếu không class
    // màu theo tone sẽ nuốt mất font token. Xem `cn.ts`.
    twMergeConfig: twMergeFontExtend,
  },
);

type DropdownVariants = VariantProps<typeof styles>;
export type DropdownSize = NonNullable<DropdownVariants['size']>;

export interface DropdownProps {
  variant?: DropdownVariant;
  size?: DropdownSize;
  options: DropdownOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Nút gỡ (✕) nằm trên DÒNG ĐANG CHỌN trong danh sách, thay cho nút ✕ ở ô trigger.
   * Dùng khi ô nằm trong bảng: trigger chật, và ✕ ở đó chiếm mất chỗ của mũi tên xổ
   * nên nhìn không ra là ô chọn được. Bấm ✕ trong danh sách = bỏ gắn + đóng panel.
   */
  clearInList?: boolean;
  placeholder?: string;
  /**
   * Nguồn hiển thị trên trigger (ô đã chọn): `'label'` (mặc định), `'badge'` hoặc `'meta'`
   * — dùng khi muốn ô hiện giá trị NGẮN (mã ở badge, hoặc ngày/số ở meta) còn danh sách
   * vẫn hiện tên đầy đủ. Fallback về label khi option thiếu trường tương ứng.
   */
  triggerDisplay?: 'label' | 'badge' | 'meta';
  searchable?: boolean;
  /** Placeholder cho ô tìm kiếm (khi `searchable`). */
  searchPlaceholder?: string;
  /**
   * Độ trễ (ms) debounce lọc kết quả tìm kiếm — ô nhập vẫn cập nhật tức thì,
   * chỉ việc lọc bị hoãn. Mặc định 300ms. Đặt `0` để lọc ngay không debounce.
   */
  searchDebounce?: number;
  /** Cho phép tạo giá trị mới từ ô tìm kiếm (combobox kiểu "chọn hoặc nhập mới"). */
  creatable?: boolean;
  /** Nhãn item "tạo mới" — mặc định `Tạo mới: "<q>"`. */
  createLabel?: (query: string) => string;
  /** Hiện nút xoá (✕) khi đã chọn giá trị — bấm để xoá lựa chọn. */
  clearable?: boolean;
  disabled?: boolean;
  /** Error state — chuyển border sang màu error. */
  invalid?: boolean;
  /** Trigger className override. */
  className?: string;
  /** Content (panel) className override. */
  contentClassName?: string;
  /**
   * Class cho cột `meta` của option — dùng khi muốn GHIM bề rộng để mọi dòng
   * thẳng cột (vd `w-[184px] text-right`); mặc định meta co theo nội dung.
   */
  metaClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /**
   * ── Trợ năng: nối với nhãn nằm NGOÀI component ────────────────────────────
   * Phần tử tương tác ở đây là `<button>` / `<div>`, không phải `<input>` thật,
   * nên `<label htmlFor>` một mình không đủ để trình đọc màn hình đọc ra tên ô.
   * Nơi dùng (vd các `*Field` của kit2 form) truyền `aria-labelledby` trỏ vào id
   * của nhãn. Tất cả đều OPTIONAL — không truyền thì hành vi y hệt trước đây.
   */
  id?: string;
  /**
   * Tên truy cập TRỰC TIẾP khi không có nhãn hiển thị (bộ lọc trên thanh công cụ, ô trong bảng): nếu
   * bỏ trống, tên của ô chỉ là chữ của giá trị đang chọn ("Mọi vai trò") — không nói ô này LỌC theo
   * cái gì. Có `aria-labelledby` thì `aria-labelledby` thắng.
   */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

// Radix Select disallows empty string as item value (it's reserved for "no selection").
// Use this sentinel internally; callers still pass/receive '' normally.
const EMPTY_SENTINEL = '__empty__';
const toRadix = (v: string | undefined) => (v === '' ? EMPTY_SENTINEL : v);
const fromRadix = (v: string) => (v === EMPTY_SENTINEL ? '' : v);

/**
 * Giá trị đưa xuống Radix Root.
 *
 * ⛔ Radix tính `isControlled = value !== undefined` LẠI MỖI LẦN RENDER. Truyền
 * `undefined` cho ô đang controlled là Radix rơi về kho uncontrolled nội bộ —
 * kho đó vẫn giữ lựa chọn cũ, nên **dấu tick còn nguyên trên option vừa xoá** và
 * bấm lại chính option đó cũng không phát `onValueChange` (giá trị nội bộ không
 * đổi → Radix không báo gì).
 *
 * Rất nhiều consumer viết `value={x || undefined}` (7 chỗ trong repo lúc viết),
 * nên chặn ngay tại đây thay vì đi sửa từng nơi: chỉ coi là uncontrolled khi
 * caller CHỦ ĐỘNG truyền `defaultValue` và KHÔNG truyền `value`. Còn lại
 * `undefined` = "chưa chọn gì" → EMPTY_SENTINEL để Radix GIỮ controlled.
 */
const radixRootValue = (value: string | undefined, defaultValue: string | undefined) =>
  value === undefined && defaultValue !== undefined ? undefined : toRadix(value ?? '');

const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(
  (
    {
      variant = 'tick',
      size,
      options,
      value,
      defaultValue,
      onValueChange,
      clearInList = false,
      placeholder = 'Chọn',
      triggerDisplay = 'label',
      searchable = false,
      searchPlaceholder = 'Tìm kiếm...',
      searchDebounce = 300,
      creatable = false,
      createLabel,
      clearable = false,
      disabled,
      invalid,
      className,
      contentClassName,
      metaClassName,
      side = 'bottom',
      align = 'start',
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
    const searchInputRef = searchInputProps.ref;
    const contentRef = useRef<HTMLDivElement>(null);
    // Radix Select là listbox: khi panel được đặt vị trí xong nó gọi
    // `focusSelectedItem()` → cướp focus về item đang chọn. Cờ này cho phép
    // "đòi" lại focus ĐÚNG MỘT LẦN cho ô tìm kiếm; sau đó trả quyền cho Radix để
    // hover/mũi tên vẫn highlight item bình thường.
    const searchFocusClaimedRef = useRef(false);
    // Ô nhập cập nhật `search` tức thì; việc lọc dùng giá trị đã debounce để
    // tránh filter lại danh sách lớn theo từng phím gõ.
    const debouncedSearch = useDebounce(search, searchDebounce);
    // Open state controlled để CHỈ dựng option elements khi panel mở. Đóng →
    // không map options (tránh dựng hàng trăm <Item> cho mỗi Dropdown khi mount
    // / re-render bảng nhiều dòng — nguồn gây giật chính).
    const [open, setOpen] = useState(false);
    const slots = styles({ size, invalid });

    // creatable: ép giá trị đã tạo (không có trong options) thành 1 option ẩn để
    // trigger Radix Select vẫn hiển thị được nhãn đã chọn.
    const baseOptions = useMemo<DropdownOption[]>(() => {
      if (!creatable || !value || options.some((o) => o.value === value)) {
        return options;
      }
      return [{ value, label: value }, ...options];
    }, [options, creatable, value]);

    // Tập value KHỚP từ khoá — `null` nghĩa là "không lọc" (khớp tất cả).
    //
    // Cố tình trả về tập value thay vì mảng option đã lọc: option KHÔNG khớp vẫn
    // phải được render (chỉ ẩn + disable). Nếu unmount chúng, item đang chọn biến
    // mất → Radix `setSelectedItem(null)` → effect `focusSelectedItem` chạy lại →
    // focus bị giật khỏi ô tìm kiếm ngay giữa lúc gõ.
    //
    // So khớp qua `normalizeSearch` (bỏ dấu + hạ chữ thường): gõ "met khoi" phải
    // ra "Mét khối", "CAI" phải ra "Cái". Khớp trên cả 3 trường người dùng NHÌN
    // THẤY — nhãn, mã pill (`badge`), text phụ (`meta`) — vì ở danh mục ĐVT / nhà
    // thầu người dùng thường gõ MÃ chứ không gõ tên.
    //
    // ⛔ KHÔNG khớp `option.value`: nó thường là id kỹ thuật (`"12"`), gõ "1" sẽ
    // trúng bừa hàng loạt dòng chẳng liên quan.
    const matchedValues = useMemo(() => {
      const query = searchable ? normalizeSearch(debouncedSearch) : '';
      if (!query) return null;
      const matched = new Set<string>();
      for (const option of baseOptions) {
        if (
          includesNormalized(option.label, query) ||
          includesNormalized(option.badge, query) ||
          includesNormalized(option.meta, query)
        ) {
          matched.add(option.value);
        }
      }
      return matched;
    }, [baseOptions, searchable, debouncedSearch]);

    const matchCount = matchedValues ? matchedValues.size : baseOptions.length;

    // Nhãn hiển thị trên trigger — tự tính từ value + options (KHÔNG dùng
    // Radix Select.Value: nó cache nhãn item cũ, không reset khi clear về rỗng).
    // triggerDisplay='badge'/'meta' → ưu tiên trường ngắn tương ứng, fallback label.
    const selectedOption = useMemo(
      () => (value ? baseOptions.find((o) => o.value === value) : undefined),
      [value, baseOptions],
    );

    const selectedLabel = useMemo(() => {
      if (!selectedOption) return '';
      if (triggerDisplay === 'badge') return selectedOption.badge ?? selectedOption.label;
      if (triggerDisplay === 'meta') return selectedOption.meta ?? selectedOption.label;
      return selectedOption.label;
    }, [selectedOption, triggerDisplay]);

    // Tone của option đang chọn → tô màu nhãn trên trigger (Figma: severity có màu).
    const selectedTone = selectedOption?.tone;

    // Item "tạo mới" khi search không khớp option nào (mode creatable).
    const createOption = useMemo<DropdownOption | null>(() => {
      if (!creatable) return null;
      const q = debouncedSearch.trim();
      if (!q) return null;
      const normalized = normalizeSearch(q);
      const exists = baseOptions.some((o) => normalizeSearch(o.label) === normalized);
      return exists
        ? null
        : {
            value: q,
            label: createLabel ? createLabel(q) : `Tạo mới: "${q}"`,
            icon: 'plus-outline',
          };
    }, [creatable, debouncedSearch, baseOptions, createLabel]);

    // MỌI option đều được render (item "tạo mới" nối đuôi); cái không khớp từ
    // khoá mang cờ `hidden` → ẩn bằng CSS + `disabled`, KHÔNG unmount.
    const renderedOptions = useMemo(() => {
      const rows = baseOptions.map((option) => ({
        option,
        hidden: !!matchedValues && !matchedValues.has(option.value),
      }));
      return createOption ? [...rows, { option: createOption, hidden: false }] : rows;
    }, [baseOptions, matchedValues, createOption]);

    // CHỈ dựng khi mở panel — đóng thì trả null (Content chưa mount nên không
    // cần items, tránh chi phí map options mỗi render).
    const optionElements = useMemo(
      () =>
        !open
          ? null
          : renderedOptions.map(({ option, hidden }) => (
              <SelectPrimitive.Item
                key={option.value}
                className={slots.item({
                  class: cn(
                    option.tone && [
                      OPTION_TONE[option.tone].text,
                      OPTION_TONE[option.tone].selectedBg,
                    ],
                    // `hidden` đứng sau để thắng `flex` của FIELD_POPUP_ITEM_CLASS.
                    hidden && 'hidden',
                  ),
                })}
                disabled={option.disabled || hidden}
                value={toRadix(option.value) as string}
              >
                {option.dotColor !== undefined && (
                  <OptionDot color={option.dotColor} shape={option.dotShape} />
                )}
                {option.icon && (
                  <SystemIcon className="size-4 shrink-0 text-fg-3" name={option.icon} size={10} />
                )}
                {option.badge && (
                  <Badge className="shrink-0" color="neutral" variant="tinted">
                    {option.badge}
                  </Badge>
                )}
                {/* `title` cho cả hai cột: chữ ở đây bị cắt "…" (label luôn
                    `truncate`, meta khi consumer ghim bề rộng qua `metaClassName`)
                    nên phải có đường xem đầy đủ. Dùng `title` gốc chứ KHÔNG bọc
                    kit2 `<Tooltip>`: item của Radix Select nghe pointer/keyboard
                    để chọn và typeahead, chèn thêm một lớp trigger vào giữa là
                    rước rủi ro nuốt thao tác chọn. */}
                <SelectPrimitive.ItemText asChild>
                  <span className="min-w-0 flex-1 truncate" title={option.label}>
                    {option.label}
                  </span>
                </SelectPrimitive.ItemText>

                {option.meta && (
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap text-caption-12 tabular-nums text-fg-on-popup-muted',
                      metaClassName,
                    )}
                    title={option.meta}
                  >
                    {option.meta}
                  </span>
                )}

                {/* Gỡ lựa chọn ngay trên dòng đang chọn. `onPointerDown` chứ không
                    `onClick`: Radix Select chốt lựa chọn ở pointer-down, đợi tới click
                    là nó đã chọn lại chính option đó rồi. */}
                {clearInList && value === option.value && (
                  <span
                    aria-label="Gỡ lựa chọn"
                    className="flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-7/60 p-1 text-fg-2 transition-colors hover:bg-error-5/80 hover:text-neutral-0"
                    role="button"
                    tabIndex={-1}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onValueChange?.('');
                      setOpen(false);
                    }}
                  >
                    <SystemIcon name="xmark-outline" size={FIELD_CLEAR_ICON.chip} />
                  </span>
                )}

                {variant === 'radio' ? (
                  <span className={slots.radioRing()}>
                    <SelectPrimitive.ItemIndicator>
                      <span className="size-2.5 bg-primary-5 block rounded-full" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                ) : (
                  <SelectPrimitive.ItemIndicator>
                    <SystemIcon
                      className={cn(
                        'size-5 shrink-0',
                        option.tone ? OPTION_TONE[option.tone].check : 'text-primary-5',
                      )}
                      name="check-outline"
                      size={12}
                    />
                  </SelectPrimitive.ItemIndicator>
                )}
              </SelectPrimitive.Item>
            )),
      [open, renderedOptions, slots, variant, metaClassName, clearInList, value, onValueChange],
    );

    // Mở panel → đưa con trỏ vào thẳng ô tìm kiếm. Bắt buộc phải chủ động gọi:
    // Radix Select KHÔNG có `onOpenAutoFocus`, nó luôn tự focus item đang chọn
    // (hoặc chính panel). Khi danh sách rỗng vì options tải async thì nó không
    // focus được gì cả → focus KẸT LẠI trên trigger, mà trigger lúc này nằm
    // trong vùng vừa bị `hideOthers()` gắn aria-hidden → cảnh báo
    // "Blocked aria-hidden on an element because its descendant retained focus".
    //
    // ⛔ Một cú `focus()` là KHÔNG đủ. Panel mở bằng `pointerdown`, còn hành vi
    // mặc định "focus phần tử vừa bấm" của trình duyệt chạy ở `mousedown` — tức
    // SAU effect này. Kết quả: ô tìm kiếm nhận focus rồi bị trigger giành lại
    // ngay, người dùng gõ không vào đâu cả. Vì vậy phải đòi lại ở macrotask kế
    // tiếp, và chỉ đòi khi con trỏ KHÔNG nằm trong panel (đang ở item thì để yên
    // cho Radix highlight).
    useEffect(() => {
      if (!open || !searchable) return;
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      const timer = window.setTimeout(() => {
        const active = document.activeElement;
        if (active === input) return;
        if (active && contentRef.current?.contains(active)) return;
        input.focus();
      }, 0);
      return () => window.clearTimeout(timer);
      // searchInputRef là ref ổn định — cố tình không đưa vào deps.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, searchable]);

    // Gõ tiếp khi con trỏ đã rơi vào item (hover chuột / mũi tên) → ký tự phải
    // chảy về Ô TÌM KIẾM chứ không vào typeahead của Radix. Không có nhánh này,
    // người dùng gõ được chữ đầu rồi "mất chữ" từ chữ thứ hai trở đi.
    const handleContentKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const input = searchInputRef.current;
        if (!searchable || !input || event.target === input) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        // Bộ gõ tiếng Việt/CJK đang ghép dấu → KHÔNG cướp phím (`ime-safe-input.md`).
        if (event.nativeEvent.isComposing) return;
        const isChar = event.key.length === 1;
        const isBackspace = event.key === 'Backspace';
        if (!isChar && !isBackspace) return;
        // `preventDefault` ở pha CAPTURE → mọi handler của Radix (typeahead ở
        // Content lẫn "Space = chọn item" ở Item) đều bị bỏ qua, vì
        // `composeEventHandlers` của Radix kiểm `event.defaultPrevented`.
        event.preventDefault();
        const next = isBackspace ? input.value.slice(0, -1) : input.value + event.key;
        input.value = next;
        setSearch(next);
        input.focus();
        input.setSelectionRange(next.length, next.length);
      },
      // searchInputRef ổn định — cố tình không đưa vào deps.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [searchable],
    );

    return (
      <SelectPrimitive.Root
        defaultValue={toRadix(defaultValue)}
        disabled={disabled}
        open={open}
        // "" hoặc undefined (đã clear) → EMPTY_SENTINEL để GIỮ controlled — xem
        // `radixRootValue`. Sentinel không khớp option thật → không item nào
        // `data-state=checked` (hết tick), trigger hiện placeholder (nhãn tính
        // thủ công qua selectedLabel). Chỉ khi caller truyền `defaultValue` mà
        // không truyền `value` thì đây mới là undefined = uncontrolled thật.
        value={radixRootValue(value, defaultValue)}
        // Đóng panel → xoá từ khoá tìm kiếm (reset danh sách cho lần mở sau).
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch('');
          if (o) searchFocusClaimedRef.current = false;
        }}
        onValueChange={(v) => {
          // CHẶN artifact của BubbleSelect: khi Select nằm trong <form>, Radix render một <select>
          // native ẩn và dispatch 'change' trên nó mỗi khi value đổi PROGRAMMATICALLY (vd RHF reset
          // đổ dữ liệu vào form). Panel chưa từng mở thì select ẩn đó KHÔNG có option nào → value
          // của nó là '' → Radix đọc ngược lại và gọi onValueChange('') — xoá sạch giá trị vừa
          // reset. Đã tái hiện trong camera-form-recorder-prefill.test.tsx (HarnessInFormModal).
          //
          // Lúc panel ĐÓNG không có tương tác nào của người dùng tạo ra được thay đổi '' hợp lệ:
          // chọn option đòi panel mở, còn nút clear của chính Dropdown gọi thẳng onValueChange('')
          // không đi qua đường này. Vậy '' lúc đóng chắc chắn là artifact → nuốt.
          if (!open && fromRadix(v) === '') return;
          onValueChange?.(fromRadix(v));
        }}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid ?? (invalid || undefined)}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={slots.trigger({ class: className })}
          id={id}
        >
          {/* Chấm màu của option đang chọn — ô đóng vẫn nhận ra ngay đang lọc ai. */}
          {selectedLabel && selectedOption?.dotColor !== undefined && (
            <OptionDot color={selectedOption.dotColor} shape={selectedOption.dotShape} />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              selectedTone && OPTION_TONE[selectedTone].text,
            )}
          >
            {selectedLabel || <span className="text-fg-4">{placeholder}</span>}
          </span>
          {clearable && value && !disabled && (
            <span
              aria-label="Xoá lựa chọn"
              className="flex p-1 shrink-0 items-center justify-center rounded-full bg-neutral-7/60 text-fg-2 transition-colors hover:bg-neutral-6 hover:text-neutral-1 cursor-pointer"
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onValueChange?.('');
              }}
              // Radix Select mở menu ở pointerdown → clear NGAY tại pointerdown
              // (preempt Radix) thay vì đợi click, tránh menu mở/nuốt sự kiện.
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onValueChange?.('');
              }}
            >
              <SystemIcon name="xmark-outline" size={FIELD_CLEAR_ICON.all} />
            </span>
          )}
          {/* Mũi tên xổ LUÔN hiện — kể cả khi đã chọn và có nút xoá, giống
              `MultiSelect`. Trước đây ô đã chọn chỉ còn dấu ✕, nên nhìn vào bảng
              không ra đó là ô chọn được; hai control cạnh nhau lại khác hình. */}
          <SelectPrimitive.Icon>
            <SystemIcon className={FIELD_ICON_CLASS} name="angle-down-outline" size={10} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            ref={contentRef}
            align={align}
            className={slots.content({ class: contentClassName })}
            position="popper"
            side={side}
            sideOffset={4}
            // KHÔNG searchable → cho panel nhận focus để `focusSelectedItem()` của
            // Radix luôn có chỗ đáp khi chưa chọn gì / danh sách còn rỗng, nếu
            // không focus kẹt trên trigger và sinh cảnh báo aria-hidden khi
            // Dropdown nằm trong Modal. Có searchable thì CỐ Ý để panel không
            // focus được — như vậy Radix không giật được focus khỏi ô tìm kiếm.
            tabIndex={searchable ? undefined : -1}
            // Cú focus ĐẦU TIÊN rơi ra ngoài ô tìm kiếm chính là cú Radix cướp
            // (`focusSelectedItem`) → kéo về ô tìm kiếm rồi thôi. Focus vào chính
            // ô tìm kiếm KHÔNG tính là đã "đòi" — nếu tính, cú cướp của Radix
            // ngay sau đó sẽ không còn được kéo về nữa.
            //
            // Riêng focus rơi vào CHÍNH panel (`content`) thì luôn kéo về: đó là
            // đường lùi của `focusFirst()` khi không có item nào focus được, không
            // bao giờ là thao tác của người dùng.
            onFocus={(event) => {
              if (!searchable) return;
              const input = searchInputRef.current;
              if (!input || event.target === input) return;
              if (event.target === contentRef.current) {
                input.focus();
                return;
              }
              if (searchFocusClaimedRef.current) return;
              searchFocusClaimedRef.current = true;
              input.focus();
            }}
            onKeyDownCapture={handleContentKeyDown}
          >
            {searchable && (
              // stopPropagation — chặn Radix Select chiếm phím để typeahead/di
              // chuyển item khi người dùng đang gõ vào ô tìm kiếm.
              // (Escape vẫn đóng được: DismissableLayer nghe keydown ở document.)
              <div
                className={slots.search()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  // Mũi tên → nhảy xuống danh sách (bỏ qua option đang bị ẩn/disabled).
                  const items = contentRef.current?.querySelectorAll<HTMLElement>(
                    '[role="option"]:not([data-disabled])',
                  );
                  if (!items?.length) return;
                  event.preventDefault();
                  searchFocusClaimedRef.current = true;
                  (event.key === 'ArrowDown' ? items[0] : items[items.length - 1]).focus();
                }}
              >
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

            <SelectPrimitive.Viewport>
              {/* Radix ẩn scrollbar của [data-radix-select-viewport]; đặt vùng cuộn
                  ở div con để hiện thanh cuộn brand (scrollbar-thin). */}
              <div className="scrollbar-thin max-h-[300px] overflow-y-auto">
                {optionElements}

                {matchCount === 0 && !createOption && (
                  <div className="px-3 py-2.5 text-body-14 text-fg-on-popup-muted">
                    Không có kết quả
                  </div>
                )}
              </div>
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  },
);

Dropdown.displayName = 'Dropdown';

export default Dropdown;
