import { View, type DimensionValue } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { Skeleton } from './Skeleton';

/**
 * Khoảng cách giữa hai dòng chữ giả — 12dp, đo từ Figma (`Block → Paragraph`,
 * auto-layout `gap: 12`). Cùng con số dùng lại cho mọi khối ghép sẵn.
 */
const LINE_GAP_CLASS = 'gap-sm';

const FULL_WIDTH = '100%';

export interface SkeletonTextProps {
  /** ⛔ `false` trong test và ảnh chụp màn hình — xem `Skeleton`. */
  animated?: boolean;
  className?: string;
  /**
   * Bề rộng dòng CUỐI. Đoạn văn thật hiếm khi kết thúc đúng mép phải, nên dòng
   * cuối ngắn hơn là thứ làm khung xương trông giống chữ thay vì giống bảng.
   *
   * ⚠️ Chỉ áp dụng khi có từ 2 dòng trở lên: khung một dòng (nhãn, tiêu đề
   * ngắn) mà tự co lại còn 60% thì trông như đang thiếu nội dung.
   */
  lastLineWidth?: DimensionValue;
  /**
   * Số dòng. Mặc định **3** — và đó là lựa chọn của phía CODE, không phải số
   * của bản vẽ: khối `Block → Paragraph` của Figma vẽ **2** dòng.
   *
   * ⚠️ Giữ 3 vì khung xương thường thay cho một đoạn mô tả thật (2–4 dòng) và
   * ba dòng là mức "đủ giống" phổ biến nhất; cần đúng khối của bản vẽ thì
   * truyền `lines={2}`. Ghi ra đây để không ai đi tìm node Figma cho số 3.
   */
  lines?: number;
}

export function SkeletonText({
  animated = true,
  className,
  lastLineWidth = '60%',
  lines = 3,
}: SkeletonTextProps) {
  /**
   * ⚠️ Không có `w-full` ở đây, và đó là chủ ý.
   *
   * Trong cột (mặc định của React Native) con tự kéo hết bề ngang nhờ
   * `alignItems: stretch`. Còn khi khối này nằm trong HÀNG — như
   * `SkeletonParagraphWithIcon` — người gọi truyền `flex-1`; lúc đó `w-full`
   * (100% bề ngang CỦA CẢ HÀNG) sẽ đá nhau với `flex-1` và đẩy biểu tượng
   * tràn ra ngoài.
   */
  return (
    <View
      accessibilityElementsHidden
      className={cn(LINE_GAP_CLASS, className)}
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: Math.max(lines, 0) }, (_, index) => (
        <Skeleton
          key={index}
          animated={animated}
          variant="text"
          width={lines > 1 && index === lines - 1 ? lastLineWidth : FULL_WIDTH}
        />
      ))}
    </View>
  );
}
