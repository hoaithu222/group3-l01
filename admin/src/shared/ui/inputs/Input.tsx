import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { FIELD_CONTROL_CLASS, FIELD_HEIGHT, FIELD_ICON_CLASS, fieldSurface } from './field.theme';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Input — text field dùng chung, xây trên `field.theme.ts`.
 *
 * Khung/nền/hover/focus KHÔNG còn khai báo ở đây: `fieldSurface()` lo hết, nên
 * Input – Textarea – NumberInput – Dropdown… tụt vào focus giống hệt nhau
 * (viền `primary-5` + `ring-2` rõ ràng, thay cho kiểu đổi viền 1px gần như vô
 * hình trước đây). Mỗi `variant` bên dưới chỉ override đúng nét riêng của nó.
 *
 * Variants:
 *   - `glass`   (default) — chính là bề mặt chuẩn: nền `bg-input` + viền.
 *   - `outline` — nền trong suốt, chỉ còn viền — ngữ cảnh phụ / tối giản.
 *   - `filled`  — không viền, nền đặc, hover đổi nền — form dày / dòng list.
 *   - `ghost`   — không viền, nền mờ nhạt — inline / trong card.
 *
 * Size axis (kit2 form standard) — lấy từ `FIELD_HEIGHT`:
 *   - `sm` → 32px (h-8) · `md` → 36px (h-9, default) · `lg` → 40px (h-10)
 *
 * Error state: `invalid` → viền + ring chuyển đỏ và GIỮ đỏ cả khi focus.
 * Caller may provide `endIcon={<ChevronDownIcon />}` to mimic a select trigger.
 */

/**
 * Chrome rỗng dùng chung cho `border: none | bottomLine` — xoá viền + nền ở mọi
 * state. Tắt luôn `ring` vì không còn khung để ring ôm vào, để lại sẽ thành một
 * quầng lơ lửng trông như lỗi render.
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
        'inline-flex items-center w-full gap-2 px-3',
        'has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed',
      ],
      input: FIELD_CONTROL_CLASS,
      icon: FIELD_ICON_CLASS,
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
      /**
       * Màu lỗi do `fieldSurface` cấp. Khai báo ở đây CHỈ để compoundVariants
       * biết mà KHÔNG xoá viền đỏ ở các variant vốn không viền (filled/ghost).
       */
      invalid: { true: {}, false: {} },
      // `none`       → strips all wrapper chrome (border + bg + hover/focus/ring).
      // `bottomLine` → same stripped chrome, but a bottom border appears on focus.
      border: {
        default: {},
        none: { wrapper: BORDERLESS_CHROME },
        bottomLine: {
          // reset all sides on focus, then paint only the bottom edge
          wrapper: [...BORDERLESS_CHROME, 'focus-within:border-b-primary-5'],
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
  // tv() có twMerge riêng → phải dạy nó `text-body-14` (trong FIELD_CONTROL_CLASS)
  // là font-size chứ không phải màu, nếu không nó bị `text-fg-1` nuốt mất.
  { twMergeConfig: twMergeFontExtend },
);

type InputVariants = VariantProps<typeof styles>;
export type InputSize = NonNullable<InputVariants['size']>;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  variant?: InputVariants['variant'];
  size?: InputSize;
  invalid?: boolean;
  /**
   * Wrapper chrome:
   * - `default` (mặc định) — viền + nền đầy đủ.
   * - `none` — ẩn viền + nền.
   * - `bottomLine` — như `none`, nhưng hiện gạch chân (bottom line) khi focus.
   */
  border?: InputVariants['border'];
  /** Hiện nút "x" cuối field để xóa nhanh giá trị đã gõ (khi có value). */
  clearable?: boolean;
  /*
   * ⛔ KHÔNG có prop `debounce` — đã gỡ, đừng thêm lại.
   *
   * Nó biến `<Input>` thành controlled ở bên trong: React ghi lại `value` sau mỗi
   * phím, cắt ngang chuỗi tổ hợp của bộ gõ tiếng Việt và làm MẤT DẤU. ESLint đã
   * chặn cứng mọi chỗ dùng (`eslint.config.js`), nên prop này không nơi nào gọi
   * được — một API chết chỉ để gây nhầm.
   *
   * Muốn hoãn việc lọc: giữ ô nhập uncontrolled bằng `useImeSafeSearchInput`,
   * rồi `useDebounce(search, 300)` ở tầng query. Xem `docs/rules/ime-safe-input.md`.
   */
  /**
   * className cho KHUNG Ô bên ngoài (phần có viền, nền, icon hai đầu).
   *
   * ⛔ BỀ NGANG, LỀ và VỊ TRÍ phải đi vào ĐÂY, không phải `className`.
   *
   * `className` của component này đi vào thẻ `<input>` BÊN TRONG — đúng cho
   * `text-right`, `font-mono`, `tracking-*`, nhưng VÔ TÁC DỤNG với bề ngang:
   * thẻ trong đã là `w-full flex-1`, còn khung ngoài vẫn `w-full`. Hệ quả đo
   * được khi đặt sai chỗ (`className="max-w-md"`):
   *
   *     khung ô  1672px   ← vẫn dài cả trang
   *     <input>   448px   ← chỉ vùng chữ bị bó
   *
   * Nhìn ra là một ô nhập dài 1672px, và bài kiểm nào đo thẻ `<input>` cũng
   * BÁO XANH vì con số bên trong đúng. Nên nhớ: `w-*` / `max-w-*` / `flex-1`
   * → `wrapperClassName`.
   */
  wrapperClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      startIcon,
      endIcon,
      clearable,
      wrapperClassName,
      className,
      variant,
      size,
      invalid,
      border,
      value,
      defaultValue,
      disabled,
      onChange,
      ...props
    },
    ref,
  ) => {
    const slots = styles({ variant, size, invalid, border });

    // Ref nội bộ để clear được cả input controlled lẫn uncontrolled; vẫn forward ra ngoài.
    const innerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, []);

    const isControlled = value !== undefined;
    const [uncontrolledHasValue, setUncontrolledHasValue] = useState(
      defaultValue != null && String(defaultValue).length > 0,
    );
    const hasValue = isControlled
      ? value != null && String(value).length > 0
      : uncontrolledHasValue;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) setUncontrolledHasValue(event.target.value.length > 0);
      onChange?.(event);
    };

    const handleClear = () => {
      const input = innerRef.current;
      if (!input) return;
      // Set value rỗng qua native setter + phát input event → React onChange nhận ''.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (!isControlled) setUncontrolledHasValue(false);
      input.focus();
    };

    return (
      <div
        className={cn(
          fieldSurface({ focusMode: 'within', invalid }),
          slots.wrapper(),
          wrapperClassName,
        )}
      >
        {startIcon && <span className={slots.icon()}>{startIcon}</span>}
        <input
          ref={innerRef}
          aria-invalid={invalid ? true : undefined}
          className={slots.input({ class: className })}
          defaultValue={defaultValue}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          {...props}
        />
        {clearable && hasValue && !disabled && (
          <button
            aria-label="Xóa"
            className={slots.icon({ class: 'cursor-pointer hover:text-fg-1' })}
            tabIndex={-1}
            type="button"
            onClick={handleClear}
            onMouseDown={(e) => e.preventDefault()}
          >
            <SystemIcon name="xmark-outline" size={12} />
          </button>
        )}
        {endIcon && <span className={slots.icon()}>{endIcon}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
