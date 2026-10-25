import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { Skeleton } from './Skeleton';

/**
 * Khối "Bottom bar item" của Figma: một mục trên thanh điều hướng dưới cùng —
 * biểu tượng tròn 40dp, dưới là một thanh nhãn ngắn, cả hai canh giữa.
 *
 * Số đo từ `Block → Bottom bar item`: cột dọc, khe 4dp, đệm ngang 4dp, nhãn
 * rộng 64dp (rộng hơn khối tròn nên chính nó quyết định bề rộng mục: 64 + 4 + 4
 * = 72dp trên khung mẫu).
 */
const LABEL_WIDTH = 64;

export interface SkeletonBottomBarItemProps {
  /** ⛔ `false` trong test và ảnh chụp màn hình — xem `Skeleton`. */
  animated?: boolean;
  className?: string;
}

export function SkeletonBottomBarItem({ animated = true, className }: SkeletonBottomBarItemProps) {
  return (
    <View
      accessibilityElementsHidden
      className={cn('items-center gap-2xs px-2xs', className)}
      importantForAccessibility="no-hide-descendants"
    >
      <Skeleton animated={animated} variant="circle" />
      <Skeleton animated={animated} variant="text" width={LABEL_WIDTH} />
    </View>
  );
}
