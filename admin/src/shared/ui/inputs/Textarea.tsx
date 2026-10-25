import { forwardRef, useState } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { FIELD_CONTROL_CLASS, fieldSurface } from './field.theme';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Textarea — multi-line text input dùng CHUNG bề mặt với `Input` /
 * `NumberInput` qua `field.theme.ts` (khung + nền + hover + focus-ring).
 *
 * Native `<textarea>` under the hood — Radix doesn't ship a Textarea primitive
 * because native textarea already has full a11y.
 *
 * Size axis (kit2 form standard) — sets the *minimum* height of the resizable area:
 *   - `sm` → 32px (min-h-8)
 *   - `md` → 36px (min-h-9, default)
 *   - `lg` → 40px (min-h-10)
 *
 * The `minHeight` prop (number/px or CSS length) overrides the size preset.
 *
 * Built-in: vertical-resizable area + optional live character counter
 * (auto-on when `maxLength` is provided).
 */
const styles = tv(
  {
    slots: {
      field: [
        'relative flex flex-col w-full',
        'px-3 py-2.5',
        'has-[textarea:disabled]:opacity-50 has-[textarea:disabled]:cursor-not-allowed',
      ],
      textarea: [
        FIELD_CONTROL_CLASS,
        // FIELD_CONTROL_CLASS đặt `flex-1` — đúng cho control 1 dòng nằm NGANG
        // trong wrapper `flex-row`. Ở đây `field` là `flex-col` nên `flex-1`
        // (basis 0) sẽ nuốt mất chiều cao do `rows` / `minHeight` quy định →
        // trả về mặc định CSS `flex: 0 1 auto`.
        'flex-initial resize-y',
      ],
      /*
       * Bộ đếm nằm ĐÈ lên dải đáy của ô, sát mép trái.
       *
       * Khe kéo cỡ ô là của chính `<textarea>`, trình duyệt luôn vẽ ở góc phải-dưới của NÓ —
       * không đặt đi đâu được. Bộ đếm mà nằm thành một hàng riêng bên dưới thì hai thứ so le
       * nhau một tầng; muốn chúng NGANG NHAU thì bộ đếm phải nhảy lên đúng dải đáy ấy, nên phải
       * rời khỏi dòng chảy (`absolute`). Chỗ trống cho nó là `pb-4` cộng vào ô — xem `shouldCount`.
       *
       * `pointer-events-none` để cú bấm vẫn rơi xuống ô nhập; không kéo ngang hết bề rộng để khỏi
       * phủ mất khe kéo (div này nằm TRÊN textarea).
       */
      counterRow: 'pointer-events-none absolute bottom-2.5 left-3 flex items-center gap-1',
      // Nền cùng màu mặt ô: chữ trong ô cuộn qua dải đáy thì bị che, không chồng lên con số.
      counter: 'text-caption-10 text-fg-4 bg-bg-input',
    },
    variants: {
      size: {
        sm: { textarea: 'min-h-8' },
        md: { textarea: 'min-h-9' },
        lg: { textarea: 'min-h-10' },
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
  // tv() có twMerge riêng → dạy nó `text-body-14` (trong FIELD_CONTROL_CLASS) là
  // font-size chứ không phải màu, nếu không nó bị `text-fg-1` nuốt mất.
  { twMergeConfig: twMergeFontExtend },
);

type TextareaVariants = VariantProps<typeof styles>;
export type TextareaSize = NonNullable<TextareaVariants['size']>;

export interface TextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'size'
> {
  /** Force-show/hide the char counter. Auto-on when `maxLength` is set. */
  showCount?: boolean;
  /** Minimum height of the textarea. Number → px, or any CSS length string. Overrides `size`. */
  minHeight?: number | string;
  /** Field height preset (sm=32 / md=36 / lg=40). Default: md. Overridden by `minHeight`. */
  size?: TextareaSize;
  /** Error state — chuyển border sang màu error. */
  invalid?: boolean;
  /** Wrapper (field) className. */
  wrapperClassName?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      showCount,
      maxLength,
      minHeight,
      size,
      invalid,
      value,
      defaultValue,
      onChange,
      wrapperClassName,
      className,
      style,
      ...rest
    },
    ref,
  ) => {
    const slots = styles({ size });
    const isControlled = value !== undefined;
    // minHeight prop wins over any user-supplied inline style.
    const mergedStyle = minHeight !== undefined ? { ...style, minHeight } : style;

    // Mirror value for the counter — supports both controlled and uncontrolled.
    const [internalValue, setInternalValue] = useState<string>(
      typeof defaultValue === 'string' ? defaultValue : '',
    );
    const currentValue = isControlled ? String(value ?? '') : internalValue;
    const count = currentValue.length;

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) setInternalValue(event.target.value);
      onChange?.(event);
    };

    const shouldCount = showCount ?? Boolean(maxLength);

    return (
      <div
        className={cn(
          fieldSurface({ focusMode: 'within', invalid }),
          slots.field(),
          wrapperClassName,
        )}
      >
        <textarea
          ref={ref}
          aria-invalid={invalid ? true : undefined}
          {...(isControlled ? { value: currentValue } : { defaultValue })}
          // Còn đếm chữ thì chừa dải đáy cho con số: bộ đếm đè lên đúng dải này.
          className={slots.textarea({ class: cn(shouldCount && 'pb-4', className) })}
          maxLength={maxLength}
          style={mergedStyle}
          onChange={handleChange}
          {...rest}
        />
        {shouldCount && (
          <div className={slots.counterRow()}>
            <span className={slots.counter()}>
              {count}
              {maxLength ? `/${maxLength}` : ''}
            </span>
          </div>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;
