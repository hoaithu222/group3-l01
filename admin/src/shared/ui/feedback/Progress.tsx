import { forwardRef } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import Text from '@/shared/ui/primitives/Text';

/**
 * Progress — thanh tiến độ tuyến tính (kit2).
 *
 * Variant axis:
 *   - `variant`: màu fill + màu label (primary / success / warning / error / neutral).
 *   - `size`: chiều cao track (xs / sm / md / lg).
 *
 * Usage:
 *   <Progress value={40} />
 *   <Progress value={100} variant="success" size="sm" showValue />
 */
const progress = tv({
  slots: {
    root: 'flex w-full items-center gap-2',
    track: 'min-w-0 flex-1 overflow-hidden bg-bg-4',
    fill: 'h-full transition-all duration-300',
    value: 'shrink-0 w-9 text-right tabular-nums',
  },
  variants: {
    variant: {
      primary: { fill: 'bg-primary-5', value: 'text-primary-5' },
      success: { fill: 'bg-success-5', value: 'text-success-5' },
      warning: { fill: 'bg-warning-5', value: 'text-warning-5' },
      error: { fill: 'bg-error-5', value: 'text-error-5' },
      neutral: { fill: 'bg-neutral-5', value: 'text-fg-4' },
    },
    size: {
      xs: { track: 'h-1' },
      sm: { track: 'h-1.5' },
      md: { track: 'h-2' },
      lg: { track: 'h-3' },
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ProgressVariants = VariantProps<typeof progress>;
export type ProgressVariant = NonNullable<ProgressVariants['variant']>;
export type ProgressSize = NonNullable<ProgressVariants['size']>;

export interface ProgressProps {
  /** Giá trị hiện tại. */
  value?: number;
  /** Giá trị lớn nhất (mặc định 100). */
  max?: number;
  variant?: ProgressVariant;
  size?: ProgressSize;
  /** Hiện % bên phải thanh. */
  showValue?: boolean;
  className?: string;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value = 0, max = 100, variant, size, showValue = false, className }, ref) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const slots = progress({ variant, size });
    const rounded = Math.round(pct);

    return (
      <div ref={ref} className={slots.root({ class: className })}>
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={rounded}
          className={slots.track()}
          role="progressbar"
        >
          <div className={slots.fill()} style={{ width: `${pct}%` }} />
        </div>
        {/* Slot `value`: bề rộng CỐ ĐỊNH + căn phải + tabular-nums → nhiều thanh
            xếp chồng (bảng, danh sách) thì mép thanh và cột số luôn thẳng hàng,
            không nhảy theo độ dài "5%" ↔ "100%". */}
        {showValue && (
          <Text className={slots.value()} size="tiny">
            {rounded}%
          </Text>
        )}
      </div>
    );
  },
);

Progress.displayName = 'Progress';

export default Progress;
