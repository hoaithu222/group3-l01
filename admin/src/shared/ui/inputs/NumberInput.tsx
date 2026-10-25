import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { NumericFormat } from 'react-number-format';
import { tv, type VariantProps } from 'tailwind-variants';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { FIELD_CONTROL_CLASS, FIELD_HEIGHT, fieldSurface } from './field.theme';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * NumberInput — numeric field dùng CHUNG bề mặt với `Input` qua
 * `field.theme.ts` (không còn copy nguyên khối variant từ Input như trước),
 * kèm stepper tăng/giảm, kẹp min/max và slot đơn vị.
 *
 * Value is a `number | null` (null = empty). Set `thousandSeparator` for a
 * money-style grouped *display* ("1,000,000") while still emitting a raw number
 * — otherwise NumberInput keeps the plain numeric editing experience.
 *
 * Variants — mirror `Input` (cùng nguồn `fieldSurface`):
 *   - `glass` (default) · `outline` · `filled` · `ghost`
 *
 * Size axis — lấy từ `FIELD_HEIGHT`:
 *   - `sm` → 32px (h-8) · `md` → 36px (h-9, default) · `lg` → 40px (h-10)
 *
 * Extras:
 *   - `min` / `max` — clamp on blur + disable the matching stepper at the bound
 *   - `step` — increment/decrement amount (default 1); ArrowUp/ArrowDown also step
 *   - `prefix` / `suffix` — ReactNode slots for units (₫, %, tỷ …)
 *   - `hideStepper` — drop the +/- column for a plain numeric field
 *   - `thousandSeparator` — group digits as money ("1,000,000") while typing
 *   - `decimalScale` — max decimals when grouped (0 = integers, e.g. VND)
 *   - `invalid` — viền + ring chuyển đỏ và GIỮ đỏ cả khi focus
 */

/**
 * Chrome rỗng dùng chung cho `border: none | bottomLine` — giống hệt `Input`.
 * Ring bị tắt vì không còn khung để ring ôm vào.
 */
const BORDERLESS_CHROME = [
  'border-transparent bg-transparent',
  'hover:border-transparent hover:bg-transparent',
  'focus-within:border-transparent focus-within:bg-transparent focus-within:hover:border-transparent',
  'focus-within:ring-0',
];

const styles = tv(
  {
    slots: {
      wrapper: [
        'inline-flex items-stretch w-full',
        'has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed',
      ],
      field: 'flex flex-1 min-w-0 items-center gap-2 px-3',
      input: [FIELD_CONTROL_CLASS, 'tabular-nums'],
      affix: 'inline-flex items-center shrink-0 text-body-14 text-fg-4 tabular-nums',
      stepper: 'flex flex-col shrink-0 border-l border-border-1',
      stepperBtn: [
        'flex flex-1 items-center justify-center w-7 cursor-pointer',
        'text-fg-4 transition-colors',
        'hover:text-fg-1 hover:bg-bg-2',
        'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:text-primary-5',
      ],
    },
    variants: {
      variant: {
        // `glass` = bề mặt chuẩn của field.theme → không cần override gì.
        glass: {},
        outline: { wrapper: 'bg-transparent' },
        filled: { wrapper: 'bg-bg-input hover:bg-bg-input-2' },
        ghost: { wrapper: 'bg-bg-2/50 hover:bg-bg-2 focus-within:bg-bg-2/50' },
      },
      size: {
        sm: { wrapper: FIELD_HEIGHT.sm },
        md: { wrapper: FIELD_HEIGHT.md },
        lg: { wrapper: FIELD_HEIGHT.lg },
      },
      /** Màu lỗi do `fieldSurface` cấp — xem chú thích cùng tên ở `Input.tsx`. */
      invalid: { true: {}, false: {} },
      // `none`       → strips all wrapper chrome (border + bg + hover/focus/ring)
      //                and the stepper dividers — only the input area + +/- column.
      // `bottomLine` → same stripped chrome, but a bottom border appears on focus.
      border: {
        default: {},
        none: {
          wrapper: BORDERLESS_CHROME,
          stepper: 'border-l-0',
        },
        bottomLine: {
          // reset all sides on focus, then paint only the bottom edge
          wrapper: [...BORDERLESS_CHROME, 'focus-within:border-b-primary-5'],
          stepper: 'border-l-0',
        },
      },
    },
    compoundVariants: [
      {
        variant: ['filled', 'ghost'],
        invalid: false,
        class: { wrapper: 'border-transparent hover:border-transparent' },
      },
    ],
    defaultVariants: {
      variant: 'glass',
      size: 'md',
      invalid: false,
      border: 'default',
    },
  },
  // tv() có twMerge riêng → dạy nó `text-body-14` là font-size chứ không phải màu.
  { twMergeConfig: twMergeFontExtend },
);

type NumberInputVariants = VariantProps<typeof styles>;
export type NumberInputSize = NonNullable<NumberInputVariants['size']>;

export interface NumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'type' | 'prefix'
> {
  /** Controlled value. `null` = empty. */
  value?: number | null;
  /** Uncontrolled initial value. */
  defaultValue?: number | null;
  /** Fires the parsed numeric value (`null` when the field is empty). */
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Increment/decrement amount. Default 1. */
  step?: number;
  /**
   * Cho nhập số thập phân. Mặc định `true`. Đặt `false` để field chỉ nhận SỐ
   * NGUYÊN — component tự chặn gõ dấu thập phân và cắt phần lẻ khi emit
   * (`onChange`), nên nơi dùng KHÔNG cần tự `Math.floor`.
   */
  allowDecimal?: boolean;
  variant?: NumberInputVariants['variant'];
  size?: NumberInputSize;
  invalid?: boolean;
  /**
   * Wrapper chrome:
   * - `default` (mặc định) — viền + nền đầy đủ.
   * - `none` — ẩn viền + nền + vách ngăn stepper.
   * - `bottomLine` — như `none`, nhưng hiện gạch chân (bottom line) khi focus.
   */
  border?: NumberInputVariants['border'];
  /** Leading unit/adornment slot (₫, %, …). */
  prefix?: React.ReactNode;
  /** Trailing unit/adornment slot (tỷ, kg, …). */
  suffix?: React.ReactNode;
  /** Hide the +/- stepper column. */
  hideStepper?: boolean;
  /**
   * Hiển thị dấu ngăn cách hàng nghìn theo format tiền ("1,000,000") trong khi
   * gõ. Giá trị `onChange` vẫn là `number | null` thuần. Mặc định `false` — bật
   * cho field tiền/sản lượng. Dùng `decimalScale` để giới hạn số lẻ (0 = số nguyên).
   */
  thousandSeparator?: boolean;
  /** Số chữ số thập phân tối đa khi `thousandSeparator` bật (vd 0 cho tiền VND). */
  decimalScale?: number;
  /** Wrapper (outer field) className override. */
  wrapperClassName?: string;
  /** field class name */
  fieldClassName?: string;
  /** wrapperStepperClassName */
  wrapperStepperClassName?: string;
  /** wrapperStepperClassName */
  stepperClassName?: string;
}

/** Empty string / partial ("-", "1.") → null; otherwise the parsed float. */
function parseValue(raw: string): number | null {
  if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

/** Số chữ số thập phân của một số (bỏ qua ký hiệu khoa học — không dùng ở đây). */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const dot = String(n).indexOf('.');
  return dot === -1 ? 0 : String(n).length - dot - 1;
}

/** Làm tròn `n` về `decimals` chữ số thập phân — khử lỗi dấu phẩy động khi cộng step. */
function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      min,
      max,
      step = 1,
      allowDecimal = true,
      variant,
      size,
      invalid,
      border,
      prefix,
      suffix,
      hideStepper,
      thousandSeparator,
      decimalScale,
      disabled,
      wrapperClassName,
      className,
      onBlur,
      onKeyDown,
      fieldClassName,
      wrapperStepperClassName,
      stepperClassName,
      ...rest
    },
    ref,
  ) => {
    const slots = styles({ variant, size, invalid, border });
    const isControlled = value !== undefined;

    // Ref nội bộ (cho input/NumericFormat) — vẫn chuyển tiếp cho ref ngoài.
    const innerRef = useRef<HTMLInputElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref],
    );

    // Raw text buffer so partial input ("-", "1.") survives while editing.
    const [text, setText] = useState<string>(
      value != null ? String(value) : defaultValue != null ? String(defaultValue) : '',
    );

    // Sync buffer when a controlled numeric value changes from the outside.
    useEffect(() => {
      if (!isControlled) return;
      if (parseValue(text) !== value) {
        setText(value == null ? '' : String(value));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Ở chế độ ngăn cách + controlled, buffer `text` không dùng cho hiển thị →
    // lấy số hiện tại trực tiếp từ `value`.
    const currentNumber = thousandSeparator && isControlled ? (value ?? null) : parseValue(text);

    // Field số nguyên (`allowDecimal=false`) → cắt phần lẻ trước khi emit ra ngoài.
    const coerce = useCallback(
      (n: number | null): number | null => (n != null && !allowDecimal ? Math.trunc(n) : n),
      [allowDecimal],
    );

    const emit = useCallback(
      (raw: string) => {
        // LUÔN giữ buffer text thô để hiển thị — kể cả controlled. Nếu chỉ set khi
        // uncontrolled, gõ "1." (parseValue → 1) không đổi `value` → effect sync
        // không chạy → ký tự "." bị mất, không nhập được số thập phân "1.1".
        setText(raw);
        onChange?.(coerce(parseValue(raw)));
      },
      [onChange, coerce],
    );

    const stepBy = useCallback(
      (direction: 1 | -1) => {
        const base = currentNumber ?? 0;
        // Làm tròn theo số chữ số thập phân của (giá trị hiện tại, step) → tránh lỗi
        // float (1.1+0.1 = 1.2000…2) và KHÔNG tự nống thêm số 0 (ra 1.2 chứ không 1.20).
        // Nhập tay số dài (1.1111) thì base có nhiều chữ số lẻ → step vẫn giữ độ dài đó.
        const decimals = Math.max(decimalsOf(base), decimalsOf(step));
        const next = clamp(roundTo(base + direction * step, decimals), min, max);
        const raw = String(next);
        if (!isControlled) setText(raw);
        onChange?.(coerce(next));
      },
      [currentNumber, step, min, max, isControlled, onChange, coerce],
    );

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      // Chỉ cho số + 1 dấu trừ đầu; `allowDecimal` mới cho thêm 1 dấu thập phân.
      const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
      if (raw !== '' && !pattern.test(raw)) return;
      emit(raw);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const parsed = parseValue(text);
      if (parsed !== null) {
        const clamped = clamp(parsed, min, max);
        const raw = String(clamped);
        if (raw !== text) emit(raw);
      } else if (text !== '') {
        emit('');
      }
      onBlur?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepBy(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepBy(-1);
      }
      onKeyDown?.(event);
    };

    const atMax = max !== undefined && currentNumber !== null && currentNumber >= max;
    const atMin = min !== undefined && currentNumber !== null && currentNumber <= min;

    // Keep the input focused when the stepper is pressed.
    const preventBlur = useRef((e: React.MouseEvent) => e.preventDefault()).current;

    return (
      <div
        className={cn(
          fieldSurface({ focusMode: 'within', invalid }),
          slots.wrapper(),
          wrapperClassName,
        )}
      >
        <div className={cn(slots.field(), fieldClassName)}>
          {prefix && <span className={slots.affix()}>{prefix}</span>}
          {thousandSeparator ? (
            <NumericFormat
              allowNegative={min === undefined || min < 0}
              aria-invalid={invalid || undefined}
              className={slots.input({ class: className })}
              decimalScale={allowDecimal ? decimalScale : 0}
              defaultValue={!isControlled ? (defaultValue ?? undefined) : undefined}
              disabled={disabled}
              getInputRef={setRefs}
              inputMode="numeric"
              thousandSeparator=","
              value={isControlled ? (value ?? '') : undefined}
              onBlur={(event) => {
                // Kẹp min/max khi rời field (giống chế độ thường).
                if (currentNumber !== null) {
                  const clamped = clamp(currentNumber, min, max);
                  if (clamped !== currentNumber) onChange?.(clamped);
                }
                onBlur?.(event);
              }}
              onKeyDown={handleKeyDown}
              onValueChange={(values, { source }) => {
                // Bỏ qua cập nhật do prop `value` đổi — chỉ phản hồi user gõ.
                if (source !== 'event') return;
                const next = coerce(values.floatValue ?? null);
                if (!isControlled) setText(next == null ? '' : String(next));
                onChange?.(next);
              }}
              {...rest}
            />
          ) : (
            <input
              ref={setRefs}
              aria-invalid={invalid || undefined}
              className={slots.input({ class: className })}
              disabled={disabled}
              inputMode={allowDecimal ? 'decimal' : 'numeric'}
              type="text"
              value={text}
              onBlur={handleBlur}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              {...rest}
            />
          )}
          {suffix && <span className={slots.affix()}>{suffix}</span>}
        </div>
        {!hideStepper && (
          <div className={cn(slots.stepper(), wrapperStepperClassName)}>
            <button
              aria-label="Tăng"
              className={cn(
                slots.stepperBtn({
                  class:
                    border === 'none' || border === 'bottomLine'
                      ? undefined
                      : 'border-b border-border-1',
                }),
                stepperClassName,
              )}
              disabled={disabled || atMax}
              tabIndex={-1}
              type="button"
              onClick={() => stepBy(1)}
              onMouseDown={preventBlur}
            >
              <SystemIcon
                className="cursor-pointer"
                name="angle-up-outline"
                size={size === 'sm' ? 8 : 10}
              />
            </button>
            <button
              aria-label="Giảm"
              className={cn(slots.stepperBtn(), stepperClassName)}
              disabled={disabled || atMin}
              tabIndex={-1}
              type="button"
              onClick={() => stepBy(-1)}
              onMouseDown={preventBlur}
            >
              <SystemIcon
                className="cursor-pointer"
                name="angle-down-outline"
                size={size === 'sm' ? 8 : 10}
              />
            </button>
          </div>
        )}
      </div>
    );
  },
);

NumberInput.displayName = 'NumberInput';

export default NumberInput;
