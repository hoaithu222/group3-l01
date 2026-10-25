import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { Skeleton } from './Skeleton';
import { SkeletonText } from './SkeletonText';

/**
 * Khối "Paragraph with icon" của Figma: khối tròn 40dp đứng trước hai dòng chữ.
 * Dùng cho hàng danh sách có biểu tượng/ảnh đại diện ở đầu.
 *
 * Số đo từ `Block → Paragraph + Icon`: hàng ngang, cách nhau 10dp, tổng bề
 * rộng mẫu 336 = 40 (tròn) + 10 (khe) + 286 (cột chữ).
 */
const ROW_GAP_CLASS = 'gap-2.5';

const LAST_LINE_WIDTH = 104;

export interface SkeletonParagraphWithIconProps {
  /** ⛔ `false` trong test và ảnh chụp màn hình — xem `Skeleton`. */
  animated?: boolean;
  className?: string;
}

export function SkeletonParagraphWithIcon({
  animated = true,
  className,
}: SkeletonParagraphWithIconProps) {
  return (
    <View
      accessibilityElementsHidden
      /**
       * ⚠️ `items-end`, không phải `items-center`. Figma canh ĐÁY: cột chữ cao
       * 36 (12 + 12 + 12) còn khối tròn cao 40, canh giữa thì dòng chữ trên bị
       * đẩy lên cao hơn mép trên của biểu tượng và cả hàng trông lệch.
       */
      className={cn('flex-row items-end', ROW_GAP_CLASS, className)}
      importantForAccessibility="no-hide-descendants"
    >
      <Skeleton animated={animated} variant="circle" />
      <SkeletonText
        animated={animated}
        className="flex-1"
        lastLineWidth={LAST_LINE_WIDTH}
        lines={2}
      />
    </View>
  );
}
