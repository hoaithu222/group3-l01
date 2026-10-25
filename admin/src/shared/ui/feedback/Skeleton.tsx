/**
 * Skeleton — kit2 loading placeholder.
 *
 * Variant shapes: `text` (h-3 with bottom margin), `rectangle` (default),
 * `circle` (1:1 with `rounded-full`). Sizes inherit container or are set
 * explicitly via `width` / `height` (number → px, string → CSS value).
 *
 *   <Skeleton variant="text" width="60%" />
 *   <Skeleton variant="rectangle" width={240} height={120} rounded="md" />
 *   <Skeleton variant="circle" width={40} height={40} />
 */

import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '@/shared/utils/style/cn';

const skeletonStyles = tv({
  base: 'block animate-pulse bg-neutral-7/40',
  variants: {
    variant: {
      text: 'h-3',
      rectangle: '',
      circle: 'aspect-square rounded-full',
    },
    rounded: {
      none: '',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-lg',
      full: 'rounded-full',
    },
  },
  defaultVariants: {
    variant: 'rectangle',
  },
});

type SkeletonVariants = VariantProps<typeof skeletonStyles>;

export type SkeletonVariant = NonNullable<SkeletonVariants['variant']>;
export type SkeletonRounded = NonNullable<SkeletonVariants['rounded']>;

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  rounded?: SkeletonRounded;
  className?: string;
}

function toCssSize(value: number | string | undefined): string | undefined {
  if (value == null) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

function Skeleton({ variant, width, height, rounded, className }: SkeletonProps) {
  const style: React.CSSProperties = {
    width: toCssSize(width),
    height: toCssSize(height),
  };

  return (
    <span
      aria-busy
      aria-label="Đang tải"
      className={cn(skeletonStyles({ variant, rounded }), className)}
      role="status"
      style={style}
    />
  );
}

export default Skeleton;
