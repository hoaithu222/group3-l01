/**
 * PageShell — VỎ NGOÀI của một trang nội dung. Sở hữu đúng một công thức bố cục.
 *
 * ── Vì sao cần một component cho ba class ──────────────────────────────────
 * Công thức `flex h-full min-h-0 flex-col gap-2` được gõ tay ở MỌI trang, và
 * mỗi lần gõ lại là một lần trôi. Đo trên hệ PMS gốc: cùng một công thức xuất
 * hiện 17 lần với 8 biến thể khác nhau — chỗ thiếu `min-h-0`, chỗ thiếu
 * `overflow-hidden`, chỗ dư một dấu cách. Hai biến thể đầu KHÔNG phải chuyện
 * thẩm mỹ: thiếu `min-h-0` thì `flex-1` bên trong không co lại được và vùng
 * cuộn cao vô hạn, tức là trang dài ra thay vì cuộn trong khung.
 *
 * ⛔ KHÔNG CÓ ĐỆM, và đừng thêm. `BackgroundLayout` đã cấp lề ngoài qua
 *    `SHELL_GUTTER_X` / `SHELL_GUTTER_Y` — cùng một hằng với thanh header nên
 *    cả ba lớp nằm trên một lưới. Trang tự thêm `p-2` là cộng dồn:
 *
 *      đo thực tế TRƯỚC khi có component này
 *        `/`         vỏ trang p-2 ⇒ nội dung bắt đầu ở x=24
 *        `/settings` vỏ trang p-2 ⇒ nội dung bắt đầu ở x=24
 *        `/demo`     không đệm    ⇒ nội dung bắt đầu ở x=16
 *
 *    Người dùng đi giữa hai trang thấy toàn bộ nội dung NHẢY 8px.
 *
 * ── Ba dạng trang ──────────────────────────────────────────────────────────
 *   `scroll`  (mặc định) Trang có vùng cuộn RIÊNG bên trong (bảng, danh sách
 *             dài). Vỏ `overflow-hidden` để cuộn xảy ra ở `<PageBody>` chứ
 *             không đẩy cả trang dài ra.
 *   `flow`    Trang ngắn, cứ để trôi tự nhiên theo nội dung — không khoá cao.
 *   `center`  Trang một khối canh giữa: 403, 404, "đang dựng", form đăng nhập.
 *
 * Usage:
 *   <PageShell>
 *     <PageHeader title="Gói thầu" tone="teal" />   ← portal lên THANH HEADER, không chiếm dòng
 *     <Toolbar left={…} right={…} />
 *     <PageBody>…</PageBody>
 *   </PageShell>
 *
 * ⛔ Tiêu đề trang KHÔNG còn là một dải `<TitleScreen>` đầu trang — nó nằm trên
 *    thanh header qua `<PageHeader>` (`@/shared/widgets/header`), trả lại cho nội
 *    dung trọn dải tiêu đề + một nhịp `gap-2`. `PageShell` không import
 *    `PageHeader` (tầng `ui` không phụ thuộc `widgets`) — page tự đặt nó ở đầu JSX.
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '@/shared/utils/style/cn';

const pageShell = tv({
  base: 'flex min-w-0',
  variants: {
    variant: {
      /**
       * `min-h-0` + `overflow-hidden` là MỘT BỘ, đừng tách:
       *   `min-h-0`          bỏ sàn `min-height: auto` của flex item, nhờ vậy
       *                      `flex-1` của `<PageBody>` mới co lại được;
       *   `overflow-hidden`  chốt phần dôi ở đây, để chính `<PageBody>` là thứ
       *                      cuộn — không phải `<main>` bên ngoài.
       */
      scroll: 'h-full min-h-0 flex-col gap-2 overflow-hidden',
      flow: 'flex-col gap-2',
      center: 'h-full items-center justify-center',
    },
  },
  defaultVariants: { variant: 'scroll' },
});

export type PageShellVariant = NonNullable<VariantProps<typeof pageShell>['variant']>;

export interface PageShellProps {
  variant?: PageShellVariant;
  children: ReactNode;
  className?: string;
}

const PageShell = memo(function PageShell({ variant, children, className }: PageShellProps) {
  return <div className={cn(pageShell({ variant }), className)}>{children}</div>;
});

export default PageShell;
