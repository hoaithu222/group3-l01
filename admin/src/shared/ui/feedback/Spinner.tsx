/**
 * Spinner — kit2 loading indicator.
 *
 * Vòng tròn xoay với border-t-transparent để chỉ render 3/4 vòng cung tạo
 * cảm giác chuyển động. Color skin dùng semantic token để adapt giữa
 * light/dark mode.
 *
 * Sizes match kit2 form scale:
 *  - `sm` → 16px (h-4 / w-4) · border 2px
 *  - `md` → 32px (h-8 / w-8) · border 3px (default)
 *  - `lg` → 48px (h-12 / w-12) · border 4px
 *
 * Usage:
 *   <Spinner size="sm" />            // dùng trong Button loading
 *   <Spinner color="success" />      // semantic skin
 *   <Spinner className="border-fg-1" /> // override border color
 */
import { tv, type VariantProps } from 'tailwind-variants';

const styles = tv({
  base: 'inline-block animate-spin border-t-transparent rounded-full',
  variants: {
    size: {
      sm: 'h-4 w-4 border-2',
      md: 'h-8 w-8 border-[3px]',
      lg: 'h-12 w-12 border-4',
    },
    color: {
      primary: 'border-primary-6',
      brand: 'border-brand',
      info: 'border-info',
      success: 'border-success',
      warning: 'border-warning',
      danger: 'border-error',
      neutral: 'border-fg-3',
      inherit: 'border-current',
    },
  },
  defaultVariants: {
    size: 'md',
    color: 'primary',
  },
});

type SpinnerVariants = VariantProps<typeof styles>;

export type SpinnerSize = NonNullable<SpinnerVariants['size']>;
export type SpinnerColor = NonNullable<SpinnerVariants['color']>;

export interface SpinnerProps extends SpinnerVariants {
  className?: string;
  /** Accessible label cho screen readers. Default "Đang tải". */
  label?: string;
}

function Spinner({ size, color, className, label = 'Đang tải' }: SpinnerProps) {
  return (
    <span
      aria-label={label}
      aria-live="polite"
      className={styles({ size, color, class: className })}
      role="status"
    />
  );
}

export default Spinner;
