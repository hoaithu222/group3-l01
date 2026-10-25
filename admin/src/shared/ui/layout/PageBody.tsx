/**
 * PageBody — VÙNG CHIẾM PHẦN CÒN LẠI của trang, và là chỗ cuộn thật.
 *
 * Nửa trong của công thức mà `<PageShell>` mở ra. Ba class của nó phải đi cùng
 * nhau, và mỗi class chữa đúng một lỗi:
 *
 *   `flex-1`     chiếm hết chiều cao còn lại sau tiêu đề / thanh công cụ.
 *   `min-h-0`    ⛔ BẮT BUỘC. Flex item mặc định có `min-height: auto`, tức nó
 *                KHÔNG chịu co nhỏ hơn nội dung. Thiếu dòng này thì `flex-1`
 *                nở ra bằng chiều cao nội dung, `overflow-y-auto` không bao giờ
 *                có gì để cuộn, và cả trang dài ra — đúng lỗi "bảng đẩy trang
 *                dài" hay gặp nhất.
 *   `min-w-0`    cùng lý do theo chiều ngang: thiếu nó, một `truncate` bên
 *                trong không cắt được và bảng đẩy trang tràn ngang.
 *
 * ── `scroll` vs `hidden` ───────────────────────────────────────────────────
 *   `scroll` (mặc định) vùng này TỰ cuộn dọc. Dùng cho danh sách thẻ, form dài.
 *   `hidden`            vùng này KHÔNG cuộn, nó chỉ là khung chứa cho một
 *                       component tự quản việc cuộn bên trong — `<Table>` ảo
 *                       hoá, `<Tree>`, `<Splitter>`. Hai lớp cuộn lồng nhau
 *                       cho ra hai thanh cuộn và bánh xe chuột nhảy giữa hai
 *                       vùng, nên chọn `hidden` khi con đã tự cuộn.
 *
 * `overscroll-contain` chặn cử chỉ vuốt hết vùng bị Safari iOS hiểu thành
 * "lùi lại trang trước" (xem `docs/rules/ipad-responsive.md §4.1`).
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/shared/utils/style/cn';

const pageBody = tv({
  base: 'min-h-0 min-w-0 flex-1',
  variants: {
    overflow: {
      scroll: 'overflow-y-auto overscroll-contain',
      hidden: 'overflow-hidden',
    },
    /** Xếp con theo cột kèm khe — tắt khi con tự lo bố cục (vd `<Splitter>`). */
    stack: {
      true: 'flex flex-col gap-2',
      false: '',
    },
  },
  defaultVariants: { overflow: 'scroll', stack: true },
});

export type PageBodyOverflow = NonNullable<VariantProps<typeof pageBody>['overflow']>;

export interface PageBodyProps {
  overflow?: PageBodyOverflow;
  stack?: boolean;
  children: ReactNode;
  className?: string;
}

const PageBody = memo(function PageBody({ overflow, stack, children, className }: PageBodyProps) {
  return <div className={cn(pageBody({ overflow, stack }), className)}>{children}</div>;
});

export default PageBody;
