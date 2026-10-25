import { SkeletonText, type SkeletonTextProps } from './SkeletonText';

/**
 * Khối "Paragraph" của Figma: hai dòng chữ giả, dòng dưới ngắn hơn.
 *
 * Số đo lấy nguyên từ `Block → Paragraph`: khoảng cách dòng 12dp (đã nằm trong
 * `SkeletonText`), dòng cuối rộng 104dp trên khung mẫu 375dp.
 *
 * ⚠️ 104 là số ĐO ĐƯỢC chứ không phải tỉ lệ — thiết kế cố định bề rộng dòng
 * cuối để mọi đoạn trong danh sách kết thúc thẳng hàng nhau. Đổi sang phần trăm
 * là mất đúng cái đó: mỗi thẻ rộng khác nhau sẽ có một mép so le khác nhau.
 */
const LAST_LINE_WIDTH = 104;

export type SkeletonParagraphProps = Pick<SkeletonTextProps, 'animated' | 'className'>;

export function SkeletonParagraph({ animated = true, className }: SkeletonParagraphProps) {
  return (
    <SkeletonText
      animated={animated}
      className={className}
      lastLineWidth={LAST_LINE_WIDTH}
      lines={2}
    />
  );
}
