import { forwardRef } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Radio — 16×16 ring, khi active thì nền `primary-6` + chấm 10×10 `neutral-0`.
 *
 * Figma states (node 264:8759 — rev.2):
 *   - Default + Default → unchecked, border neutral-5
 *   - Default + Disable → unchecked, border neutral-7 (dim, KHÔNG opacity)
 *   - Active  + Default → fill primary-6 + border primary-6, dot neutral-0
 *   - Active  + Disable → same fill, opacity-50
 *
 * ── Vì sao đổi khỏi `secondary-2` + chấm `primary-5` ────────────────────────
 * Cặp cũ trộn hai họ màu (nền cyan nhạt + chấm xanh lá) nên radio trông không
 * cùng hệ với Checkbox/Toggle, và `secondary-2` (#B3E5F0) quá nhạt để phân biệt
 * với nền trắng ở light theme. Nay dùng chung công thức với Checkbox và Toggle:
 * nền brand `primary-6` + dấu `neutral-0`, ring focus `primary-5/40`.
 *
 * Always renders inside a `<RadioGroup>` (Radix root re-export).
 */
const radio = tv(
  {
    slots: {
      root: [
        'inline-flex shrink-0 items-center justify-center rounded-full border size-4',
        'transition-colors cursor-pointer',
        // KHÔNG `ring-offset`: xem ghi chú trong Checkbox.tsx (vành trắng ở dark).
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-5/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // unchecked
        'data-[state=unchecked]:border-neutral-5 data-[state=unchecked]:bg-transparent',
        // unchecked + disabled → ring dịu hơn, giữ nguyên opacity (Figma states="Disable")
        'data-[state=unchecked]:disabled:border-neutral-7 data-[state=unchecked]:disabled:opacity-100',
        // checked → nền + viền brand
        'data-[state=checked]:border-primary-6 data-[state=checked]:bg-primary-6',
      ],
      dot: 'size-2.5 rounded-full bg-neutral-0',
      label: 'text-body-14 text-fg-1',
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

export interface RadioProps extends Omit<
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
  'asChild'
> {
  /** Optional label rendered next to the ring. */
  label?: React.ReactNode;
}

const Radio = forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Item>, RadioProps>(
  ({ label, className, id, ...props }, ref) => {
    const slots = radio();

    const ring = (
      <RadioGroupPrimitive.Item
        ref={ref}
        className={slots.root({ class: className })}
        id={id}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="inline-flex items-center justify-center">
          <span className={slots.dot()} />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    );

    if (!label) return ring;

    return (
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        {ring}
        <span className={slots.label()}>{label}</span>
      </label>
    );
  },
);

Radio.displayName = 'Radio';

/** Radix RadioGroup.Root re-export — wraps a set of `<Radio>` items. */
export const RadioGroup = RadioGroupPrimitive.Root;

export default Radio;
