/**
 * BoxGrid — lưới THẺ / PANEL của trang: khai bề ngang một ô, số cột do màn quyết.
 *
 * ── Ba lưới của base, đừng lẫn ─────────────────────────────────────────────
 *   `<BoxGrid>`   THẺ và PANEL. Khai `min` (bề ngang tối thiểu một ô), số cột
 *                 do bề ngang màn quyết định. Không cần một bậc `sm:`/`lg:` nào.
 *   `<FormGrid>`  FIELD của form. Khai `cols` (số cột), mỗi cột có TRẦN 448px.
 *                 Số cột là ý đồ của người dựng form, không phải của cái màn.
 *   `<DemoGrid>`  chỉ dùng trong trang trưng bày.
 *
 * ── Vì sao không dùng `grid-cols-N` cố định ────────────────────────────────
 * `sm:grid-cols-3` nghĩa là "chia đều bề ngang cho 3". Trên khung nội dung
 * ~1670px của màn ngoài, mỗi ô thành 550px — một thẻ KPI rộng 550px thì nhãn
 * nằm tận mép trái và con số tận mép phải. `auto-fill` + `minmax` lật ngược
 * quan hệ: khai BỀ NGANG ĐỌC ĐƯỢC, để số cột tự ra.
 *
 * ⛔ `min(100%, …)` là phần BẮT BUỘC trong công thức: thiếu nó, ở khung hẹp hơn
 *    `minmax` thì ô tràn khỏi lưới và trang sinh thanh cuộn ngang.
 *
 * ⚠️ KHI NÀO KHÔNG dùng: khi hàng thẻ là MỘT BỘ ĐỌC CÙNG NHAU và số cột là ý
 *    đồ — ví dụ dải 4 thẻ KPI phải nằm trên một hàng để so, hẹp thì gãy 2×2
 *    chứ không rớt 3+1. Ở đó viết thẳng `sm:grid-cols-2 xl:grid-cols-4`.
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/shared/utils/style/cn';

const boxGrid = tv({
  base: 'grid',
  variants: {
    /**
     * Bề ngang TỐI THIỂU của một ô — đặt theo THỨ nằm trong ô:
     *   `sm` 14rem/224px  chip, ô màu, thẻ đếm nhỏ
     *   `md` 20rem/320px  thẻ KPI, thẻ trạng thái          ← mặc định
     *   `lg` 28rem/448px  panel có tiêu đề, thẻ có mô tả
     *   `xl` 36rem/576px  panel chứa bảng con hoặc biểu đồ
     *
     * ⛔ Viết LITERAL, KHÔNG ghép chuỗi: Tailwind v4 quét mã như văn bản thuần
     *    nên class chỉ tồn tại lúc chạy thì scanner không sinh ra gì, và lưới
     *    im lặng mất hết cột. Cùng cái bẫy đã ghi ở `FormGrid`.
     */
    min: {
      sm: '[grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))]',
      md: '[grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]',
      lg: '[grid-template-columns:repeat(auto-fill,minmax(min(100%,28rem),1fr))]',
      xl: '[grid-template-columns:repeat(auto-fill,minmax(min(100%,36rem),1fr))]',
    },
    gap: { sm: 'gap-2', md: 'gap-3', lg: 'gap-4' },
    /**
     * Canh mép TRÊN thay vì kéo mọi ô cao bằng ô cao nhất.
     *
     * ⛔ ĐỪNG bật cho một hàng THẺ: cao bằng nhau chính là thứ làm chúng đọc ra
     *    là một hàng. Chỉ bật khi ô là khối rời có chiều cao chênh nhau nhiều.
     */
    align: { start: 'items-start', stretch: '' },
  },
  defaultVariants: { min: 'md', gap: 'sm', align: 'stretch' },
});

export type BoxGridMin = NonNullable<VariantProps<typeof boxGrid>['min']>;

export interface BoxGridProps extends VariantProps<typeof boxGrid> {
  children: ReactNode;
  className?: string;
}

const BoxGrid = memo(function BoxGrid({ min, gap, align, children, className }: BoxGridProps) {
  return <div className={cn(boxGrid({ min, gap, align }), className)}>{children}</div>;
});

export default BoxGrid;
