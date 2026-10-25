/**
 * field.theme.ts — NGUỒN DUY NHẤT cho "bề mặt" của mọi ô nhập liệu.
 *
 * Trước đây cùng 5 class này bị lặp ở 21 chỗ (Input, Textarea, NumberInput,
 * Dropdown, MultiSelect, PickerTrigger, MonthYear*, MaskedField, IPAddressField,
 * AsyncSelectField, ColorPickerField, RichTextEditor, …) với 4 cơ chế focus
 * khác nhau và 3 biến thể màu placeholder → gõ vào ô nào cũng thấy khác nhau.
 * File này gom lại một chỗ.
 *
 * ── Nguyên tắc thiết kế (rút từ khảo sát template TQ) ────────────────────────
 *  1. FOCUS PHẢI THẤY RÕ NHƯNG KHÔNG CHÓI. Bản cũ chỉ đổi màu viền 1px và
 *     `outline-none` → gần như vô hình. Nay dùng "hai kênh": viền đổi màu +
 *     QUẦNG `ring-1` mờ (`/25`) bên ngoài. Viền mới là kênh chính; ring chỉ
 *     phụ hoạ. `ring-2` + `/40` như bản trước bị chói trên nền tối.
 *  2. HOVER PHẢI NHẸ HƠN FOCUS. Bản Element-UI mà 35/37 trang login TQ dùng
 *     đặt hover = focus = cùng một màu → không phân biệt được "chuột đang ở
 *     trên" với "con trỏ đang trong ô". Ở đây hover chỉ đậm viền, không có ring.
 *  3. LỖI GIỮ MÀU ĐỎ KHI FOCUS. Focus vào ô lỗi vẫn đỏ (ring đỏ), KHÔNG
 *     chuyển xanh — nếu không người dùng tưởng đã sửa xong.
 *  4. CARET + SELECTION có màu riêng. Không một template nào trong 119 folder
 *     đặt hai thứ này; trên nền tối con trỏ nhập gần như không thấy.
 *
 * Màu bám `primary-5` (#33B351) = `--color-brand`, giống nhau ở cả light/dark.
 */
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/** Chiều cao chuẩn theo `FieldSize` — dùng chung cho MỌI control 1 dòng. */
export const FIELD_HEIGHT = {
  sm: 'h-8',
  md: 'h-9',
  lg: 'h-10',
} as const;

/**
 * Bề mặt ô nhập — khung + nền + các state.
 *
 * `focusMode` chọn selector focus cho đúng loại control:
 *  - `within`: control có `<input>` thật lồng bên trong (Input, Textarea,
 *    NumberInput, RichTextEditor…) → phải bắt `focus-within`.
 *  - `trigger`: control là `<button>` mở panel (Dropdown, MultiSelect,
 *    DatePicker…) → bắt `focus-visible` + `data-[state=open]`.
 */
export const fieldSurface = tv(
  {
    base: [
      'w-full transition-[color,border-color,background-color,box-shadow] duration-150 ease-out',
      'border bg-bg-input',
    ],
    variants: {
      focusMode: {
        within: [
          'border-border-1',
          'hover:border-border-2',
          'focus-within:border-primary-5',
          'focus-within:ring-1 focus-within:ring-primary-5/25',
          'focus-within:hover:border-primary-5',
        ],
        trigger: [
          'border-border-1 outline-none',
          'hover:border-border-2',
          'focus-visible:border-primary-5 focus-visible:ring-1 focus-visible:ring-primary-5/25',
          'data-[state=open]:border-primary-5 data-[state=open]:ring-1 data-[state=open]:ring-primary-5/25',
          'data-[state=open]:hover:border-primary-5',
        ],
      },
      invalid: { true: '', false: '' },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    compoundVariants: [
      // Lỗi + focus: GIỮ đỏ, chỉ đổi ring sang đỏ. Không được chuyển xanh.
      {
        invalid: true,
        focusMode: 'within',
        class: [
          'border-error',
          'hover:border-error',
          'focus-within:border-error focus-within:ring-error/25',
          'focus-within:hover:border-error',
        ],
      },
      {
        invalid: true,
        focusMode: 'trigger',
        class: [
          'border-error',
          'hover:border-error',
          'focus-visible:border-error focus-visible:ring-error/25',
          'data-[state=open]:border-error data-[state=open]:ring-error/25',
          'data-[state=open]:hover:border-error',
        ],
      },
    ],
    defaultVariants: { focusMode: 'within', invalid: false, disabled: false },
  },
  { twMergeConfig: twMergeFontExtend },
);

/**
 * Phần `<input>`/`<textarea>` bên trong — trong suốt, viền do wrapper lo.
 * Bao gồm caret + selection màu brand (không template nào có) và khoá autofill
 * vàng của Chrome.
 */
export const FIELD_CONTROL_CLASS = [
  'w-full min-w-0 flex-1 border-none bg-transparent outline-none',
  'text-body-14 text-fg-1 placeholder:text-fg-4',
  'caret-primary-5 selection:bg-primary-5/30 selection:text-fg-1',
  'disabled:cursor-not-allowed',
  'autofill:[transition:background-color_9999s_ease-in-out_0s]',
  'autofill:[-webkit-text-fill-color:var(--color-fg-1)]',
  'autofill:[box-shadow:inset_0_0_0_1000px_var(--color-bg-input)]',
].join(' ');

/** Icon phụ trợ trong ô (prefix/suffix/clear/caret). */
export const FIELD_ICON_CLASS = 'inline-flex shrink-0 items-center justify-center size-5 text-fg-4';

/** Panel bung ra của Dropdown / MultiSelect / DatePicker — thống nhất 1 kiểu. */
export const FIELD_POPUP_CLASS = [
  'z-50 overflow-hidden',
  'border border-popup-border',
  'bg-bg-popup backdrop-blur-[20px]',
  'shadow-[0_8px_28px_var(--color-popup-shadow)]',
].join(' ');

/** 1 dòng option trong panel — thanh accent trái trượt ra khi highlight. */
export const FIELD_POPUP_ITEM_CLASS = [
  'relative flex items-center gap-3 px-3 py-2.5',
  'text-body-14 text-fg-on-popup',
  'cursor-pointer select-none outline-none',
  'transition-colors duration-150',
  'data-[highlighted]:bg-nav-hover-bg',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
  "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-0.5",
  'before:bg-primary-5 before:scale-y-0 before:transition-transform before:duration-150',
  'data-[highlighted]:before:scale-y-100',
].join(' ');

/**
 * Cỡ icon của hai nút "xoá" trong ô chọn — HAI VAI TRÒ khác nhau, đừng lẫn.
 *
 * Trước khi gom, năm chỗ dùng năm con số: xoá-một-chip là 6 / 8 / 10 và
 * xoá-tất-cả là 6 / 10 / 12. Nặng nhất là `Dropdown`: nút xoá-tất-cả vẽ ở cỡ 6
 * ngay cạnh mũi tên xổ cỡ 10 — hai nút sát nhau mà lệch hẳn một bậc.
 */
export const FIELD_CLEAR_ICON = {
  /** Dấu ✕ nằm TRONG một `<Badge>` chip — nhỏ hơn để không lấn nhãn chip. */
  chip: 8,
  /** Dấu ✕ xoá TẤT CẢ, đứng cạnh mũi tên xổ — bằng đúng cỡ mũi tên đó. */
  all: 10,
} as const;
