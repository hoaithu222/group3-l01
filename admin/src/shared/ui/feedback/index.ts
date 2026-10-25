/**
 * Phản hồi trạng thái — tải, rỗng, cảnh báo, tiến độ
 *
 * Thêm component mới vào nhóm này thì thêm dòng export ở đây.
 */

export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateSize, EmptyStateIconColor } from './EmptyState';
export { default as TableEmptyIllustration } from './TableEmptyIllustration';
export type {
  TableEmptyIllustrationProps,
  IllustrationAccentColor,
} from './TableEmptyIllustration';
export { default as Callout } from './Callout';
export type { CalloutProps, CalloutIntent, CalloutVariant } from './Callout';
export { default as Progress } from './Progress';
export type { ProgressProps, ProgressSize, ProgressVariant } from './Progress';
export { default as ProgressCircle } from './ProgressCircle';
export type {
  ProgressCircleProps,
  ProgressCircleSize,
  ProgressCircleVariant,
} from './ProgressCircle';
export { default as Spinner } from './Spinner';
export type { SpinnerColor, SpinnerProps, SpinnerSize } from './Spinner';
export { default as Skeleton } from './Skeleton';
export type { SkeletonProps, SkeletonVariant, SkeletonRounded } from './Skeleton';
export { default as LiquidGauge } from './LiquidGauge';
export type { LiquidGaugeProps, LiquidGaugeTone, LiquidGaugeShape } from './LiquidGauge';
