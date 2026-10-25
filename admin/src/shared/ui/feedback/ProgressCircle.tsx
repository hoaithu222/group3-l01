import { forwardRef } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import Text from '@/shared/ui/primitives/Text';

/**
 * ProgressCircle — vòng tròn tiến độ có % ở tâm (kit2).
 *
 * Bản tròn của `Progress`: cùng trục `variant` (màu) và cùng thang `size`, dùng khi
 * chỗ đặt hẹp bề ngang nhưng thoáng chiều cao (thẻ trong danh sách, ô KPI).
 *
 * Hai chi tiết là ĐỌC SỐ chứ không phải thẩm mỹ:
 *  - `strokeLinecap="butt"`: nắp tròn cộng thêm nửa bề dày nét vào MỖI đầu cung
 *    (vòng 36px, nét 12 → mỗi nắp ~4% chu vi) nên vòng 23% vẽ ra như ~31%.
 *  - 0% KHÔNG vẽ cung nào: để lại một chấm là người đọc hiểu "đã bắt đầu".
 *
 * Usage:
 *   <ProgressCircle value={72} />
 *   <ProgressCircle value={100} size="sm" variant="success" showValue />
 */
const progressCircle = tv({
  slots: {
    root: 'relative shrink-0',
    track: 'text-bg-4',
    fill: 'transition-[stroke-dasharray] duration-300',
    value: 'leading-none tabular-nums text-fg-1',
  },
  variants: {
    variant: {
      primary: { fill: 'text-primary-5' },
      success: { fill: 'text-success-5' },
      warning: { fill: 'text-warning-5' },
      error: { fill: 'text-error-5' },
      neutral: { fill: 'text-neutral-5' },
    },
    size: {
      xs: { root: 'size-6' },
      sm: { root: 'size-9' },
      md: { root: 'size-12' },
      lg: { root: 'size-16' },
    },
  },
  defaultVariants: { variant: 'primary', size: 'sm' },
});

type ProgressCircleVariants = VariantProps<typeof progressCircle>;
export type ProgressCircleVariant = NonNullable<ProgressCircleVariants['variant']>;
export type ProgressCircleSize = NonNullable<ProgressCircleVariants['size']>;

/**
 * Bề dày nét theo hệ toạ độ viewBox 100×100 (co giãn cùng vòng). Vòng nhỏ cần nét
 * DÀY hơn theo tỉ lệ, không thì quy về pixel chỉ còn hơn 1px và biến mất.
 */
const STROKE_WIDTH: Record<ProgressCircleSize, number> = { xs: 14, sm: 12, md: 10, lg: 9 };

/** Cỡ chữ % ở tâm — vòng `xs` quá nhỏ để chứa chữ nên không có nhãn. */
const LABEL_SIZE: Record<ProgressCircleSize, 'extraTiny' | 'tiny' | 'small'> = {
  xs: 'extraTiny',
  sm: 'extraTiny',
  md: 'tiny',
  lg: 'small',
};

export interface ProgressCircleProps {
  /** Giá trị hiện tại. */
  value?: number;
  /** Giá trị lớn nhất (mặc định 100). */
  max?: number;
  variant?: ProgressCircleVariant;
  size?: ProgressCircleSize;
  /** Hiện % ở tâm vòng. Bỏ qua ở `size="xs"` (không đủ chỗ cho chữ). */
  showValue?: boolean;
  /** Nhãn cho trình đọc màn hình — mặc định "Hoàn thành N%". */
  label?: string;
  className?: string;
}

const ProgressCircle = forwardRef<HTMLDivElement, ProgressCircleProps>(
  ({ value = 0, max = 100, variant, size = 'sm', showValue = false, label, className }, ref) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const rounded = Math.round(pct);
    const slots = progressCircle({ variant, size });

    const strokeWidth = STROKE_WIDTH[size];
    const radius = 50 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const arcLength = (pct / 100) * circumference;

    return (
      <div
        ref={ref}
        aria-label={label ?? `Hoàn thành ${rounded}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={rounded}
        className={slots.root({ class: className })}
        role="progressbar"
      >
        {/* `-rotate-90` để mốc 0% nằm ở 12 giờ; nhãn là anh em HTML nên không xoay theo. */}
        <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 100 100">
          <circle
            className={slots.track()}
            cx={50}
            cy={50}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          {arcLength > 0 && (
            <circle
              className={slots.fill()}
              cx={50}
              cy={50}
              fill="none"
              r={radius}
              stroke="currentColor"
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="butt"
              strokeWidth={strokeWidth}
            />
          )}
        </svg>

        {showValue && size !== 'xs' && (
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <Text className={slots.value()} size={LABEL_SIZE[size]} weight="bold">
              {rounded}%
            </Text>
          </span>
        )}
      </div>
    );
  },
);

ProgressCircle.displayName = 'ProgressCircle';

export default ProgressCircle;
