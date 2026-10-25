/**
 * Barrel của nhóm `skeleton`.
 *
 * ⛔ KHÔNG thêm gì vào `src/shared/ui/index.ts` từ đây — barrel tổng do agent
 * điều phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 */
export { Skeleton, type SkeletonProps } from './Skeleton';
export { SkeletonBottomBarItem, type SkeletonBottomBarItemProps } from './SkeletonBottomBarItem';
export { SkeletonParagraph, type SkeletonParagraphProps } from './SkeletonParagraph';
export {
  SkeletonParagraphWithIcon,
  type SkeletonParagraphWithIconProps,
} from './SkeletonParagraphWithIcon';
export { SkeletonText, type SkeletonTextProps } from './SkeletonText';
export { useSkeletonPulse } from './useSkeletonPulse';
