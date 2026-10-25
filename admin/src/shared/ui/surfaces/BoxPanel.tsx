/**
 * BoxPanel — Generic wrapper panel (kit2).
 *
 * Figma: PMS-NEW node 1499-9570 (default) · 10144-464978 (cyber header).
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────────────────────┐
 *   │ TITLE               [headerRight slot]  │  ← header (always visible)
 *   ├─────────────────────────────────────────┤
 *   │                                         │
 *   │   children (body — scrollable flex-1)   │
 *   │                                         │
 *   ├─────────────────────────────────────────┤
 *   │ [footer slot]                           │  ← footer (shown when footer prop provided)
 *   └─────────────────────────────────────────┘
 *
 * Variant matrix:
 *   variant="default"        → header phẳng, text-body-14-medium (mặc định)
 *   variant="cyber"          → header 44px cyber-style (hairline + sọc chéo + dots),
 *                              render qua <DetailPanelHeader>; headerRight → slot action
 *   border="hairline|strong" → khung viền 1px / 2px (mặc định không viền)
 *   bodyOverflow="hidden"    → thân là KHUNG CHỨA cho con tự cuộn (bảng tự cuộn),
 *                              thay vì chính thân cuộn
 *
 * Usage:
 *   <BoxPanel title="QUẢN LÝ MÔ HÌNH BIM">
 *     ...content...
 *   </BoxPanel>
 *
 *   <BoxPanel
 *     variant="cyber"
 *     title="CHI TIẾT ĐƠN VỊ"
 *     headerRight={<Button size="sm">Thêm</Button>}
 *   >
 *     ...content...
 *   </BoxPanel>
 */

import { memo } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import DetailPanelHeader from '../layout/DetailPanelHeader';

// ── Recipe ─────────────────────────────────────────────────────────────────────

const boxPanel = tv(
  {
    slots: {
      root: 'flex h-full flex-col bg-bg-1',
      /**
       * `touch:gap-2` — MÁY TÍNH BẢNG: khe giữa TIÊU ĐỀ và THANH CÔNG CỤ 16 → 8px.
       *
       * Khe này là KHOẢNG TRỐNG thuần, không phải vùng chạm: thu lại không làm nút
       * nào khó bấm hơn, mà trả thẳng 8px cho tiêu đề — thứ DUY NHẤT trong hàng có
       * `truncate` nên cũng là thứ duy nhất đang phải nhường chỗ. Trên iPad mọi nút
       * trong thanh công cụ đã nở ra cho vừa ngón tay nên hàng này chật hơn hẳn so
       * với cùng bề rộng trên máy tính.
       *
       * `touch:` không bao giờ khớp trên PC/laptop ⇒ desktop giữ nguyên 16px.
       */
      header: 'flex shrink-0 items-center gap-4 p-2',
      /**
       * Tiêu đề chuỗi — kèm VẠCH NHẤN 3×14px bên trái (tím thương hiệu → cyan), đúng thủ pháp
       * tiêu đề panel của console TQ (TDesign / Element / DataV): mắt bắt được "đây là đầu một
       * khối" mà không cần thêm khung hay nền cho header. Vạch là `::before` trong phần đệm
       * trái của chính span nên `truncate` không cắt mất nó, và tiêu đề dạng ReactNode (tự dựng)
       * không bị gắn thêm gì.
       */
      title: [
        'relative truncate pl-2.5 text-body-14-medium text-fg-1',
        "before:absolute before:left-0 before:top-1/2 before:h-3.5 before:w-0.75 before:-translate-y-1/2 before:content-['']",
        'before:bg-gradient-to-b before:from-primary-5 before:to-secondary-5',
      ],
      /**
       * `min-h-0 flex-1` là phần CHUNG cho cả hai kiểu thân — cách xử lý phần dôi
       * nằm ở variant `bodyOverflow` bên dưới.
       */
      body: 'min-h-0 flex-1',
      footer: 'flex shrink-0 items-center justify-between border-t border-border-1 p-2',
    },
    variants: {
      variant: {
        /** Header phẳng — hành vi gốc. */
        default: {},
        /** Header cyber 44px — slot header do DetailPanelHeader tự render. */
        cyber: {},
      },
      headerDivider: {
        true: { header: 'border-b border-border-1' },
      },
      /**
       * Khung viền của panel. Trước đây mỗi nơi dùng lại tự gõ tay
       * `className="border border-border-1"`, nên cùng một loại panel chỗ có nét
       * chỗ không. Hai bậc theo `visual-hierarchy.md §4`:
       *
       *   `hairline` panel danh sách / panel lồng trong trang — nét 1px trung tính,
       *              cùng cỡ nét với khung HUD của kit. Đây là bậc mà các màn danh
       *              sách thật đang dùng.
       *   `strong`   panel ĐỨNG RIÊNG, là khối ngoài cùng của trang — nét 2px.
       */
      border: {
        none: {},
        hairline: { root: 'border border-border-1' },
        strong: { root: 'border-2 border-border-2' },
      },
      /**
       * Thân panel xử lý phần dôi ra sao — CÙNG từ vựng với `<PageBody>`:
       *
       *   `scroll` (mặc định) thân TỰ cuộn. Hành vi gốc.
       *   `hidden`            thân KHÔNG cuộn; nó là KHUNG CHỨA cho một component
       *                       tự quản việc cuộn bên trong (`<Table>`, `<Tree>`).
       *
       * ⛔ `hidden` PHẢI kèm `flex flex-col`, không chỉ `overflow-hidden`: thiếu nó
       *    thân vẫn là khối `block`, con cao ĐÚNG BẰNG NỘI DUNG của nó và phần còn
       *    lại của panel bỏ trống — đúng lỗi "bảng không lấp hết chiều cao". Có
       *    `flex flex-col` rồi thì con chỉ cần `min-h-0 flex-1` là giãn hết phần
       *    dôi (xem `ComposedPackageTable`).
       */
      bodyOverflow: {
        scroll: { body: 'overflow-auto' },
        hidden: { body: 'flex flex-col overflow-hidden' },
      },
    },
    defaultVariants: {
      variant: 'default',
      headerDivider: false,
      border: 'none',
      bodyOverflow: 'scroll',
    },
  },
  // Slot `title` trộn token CỠ CHỮ (`text-body-14-medium`) với MÀU chữ (`text-fg-1`) — thiếu
  // config này tailwind-merge coi cả hai là "màu" và nuốt mất cỡ chữ (tailwind-conventions.md).
  { twMergeConfig: twMergeFontExtend },
);

export type BoxPanelVariant = NonNullable<VariantProps<typeof boxPanel>['variant']>;
export type BoxPanelBorder = NonNullable<VariantProps<typeof boxPanel>['border']>;
export type BoxPanelBodyOverflow = NonNullable<VariantProps<typeof boxPanel>['bodyOverflow']>;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BoxPanelProps {
  /** Panel heading — always shown. */
  title: React.ReactNode;
  /** Optional subtitle / caption beneath the title. */
  /**
   * Câu phụ dưới tiêu đề.
   *
   * ⚠️ Chỉ hiện ở `variant="default"`. Biến thể `cyber` uỷ quyền phần header cho
   * `DetailPanelHeader`, mà component đó không có chỗ cho câu phụ.
   */
  description?: string;
  /** Kiểu header. `cyber` dùng cho panel chi tiết (Figma 10144-464978). */
  variant?: BoxPanelVariant;
  /** Slot rendered on the right side of the header (e.g. action buttons). */
  headerRight?: React.ReactNode;
  /** Hiện divider dưới header (mặc định off — header liền body). */
  headerDivider?: boolean;
  /** Khung viền panel — `none` (mặc định) · `hairline` (1px) · `strong` (2px). */
  border?: BoxPanelBorder;
  /**
   * Thân TỰ cuộn (`scroll`, mặc định) hay là khung chứa cho con tự cuộn
   * (`hidden`). Chọn `hidden` khi con đã có vùng cuộn riêng — hai lớp cuộn lồng
   * nhau cho ra hai thanh cuộn cạnh nhau và bánh xe chuột nhảy giữa hai vùng.
   */
  bodyOverflow?: BoxPanelBodyOverflow;
  /**
   * Footer slot. When provided the footer strip is rendered; omit to hide it.
   * Caller is responsible for styling inner content (text, badges, etc.).
   */
  footer?: React.ReactNode;
  /** Body content. Fills remaining space and scrolls vertically when needed. */
  children?: React.ReactNode;
  /** Extra classes applied to the root container. */
  className?: string;
  /** Extra classes applied to the scrollable body wrapper. */
  bodyClassName?: string;
  /** Extra classes applied to the header wrapper. */
  headerClassName?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

const BoxPanel = memo(function BoxPanel({
  title,
  description,
  variant = 'default',
  headerRight,
  headerDivider = false,
  border,
  bodyOverflow,
  footer,
  children,
  className,
  bodyClassName,
  headerClassName,
}: BoxPanelProps) {
  const slots = boxPanel({ variant, headerDivider, border, bodyOverflow });

  return (
    <div className={cn(slots.root(), className)}>
      {/* ── Header ── */}
      {variant === 'cyber' ? (
        <DetailPanelHeader
          action={headerRight}
          className={cn(headerDivider && 'border-b border-border-1', headerClassName)}
          title={title}
        />
      ) : (
        <div className={cn(slots.header(), headerClassName)}>
          <div className="flex min-w-0 flex-1 flex-col">
            {typeof title === 'string' ? <span className={slots.title()}>{title}</span> : title}
            {/*
              `description` từng được khai trong Props nhưng KHÔNG chỗ nào render —
              mọi nơi truyền vào đều im lặng mất chữ, và `tsc` không thấy vì prop
              hợp lệ về kiểu. Câu phụ đi kèm tiêu đề nên KHÔNG `truncate`: nó có
              thể dài hơn tiêu đề và cắt đi thì mất đúng phần giải thích.
            */}
            {description ? <span className="text-caption-12 text-fg-4">{description}</span> : null}
          </div>

          {/*
            `shrink-0` giữ nguyên cho ≥1024px: thanh công cụ bên phải KHÔNG
            được co, phần thiếu trừ vào tiêu đề (tiêu đề `min-w-0` + `truncate`
            nên co được, thanh công cụ thì không).

            ⛔ BẬC `max-lg` (<1024px — MÁY TÍNH BẢNG DỌC): quy tắc đó lật ngược.
            Tiêu đề co hết cỡ rồi mà thanh vẫn dài hơn panel thì phần dư bị
            `overflow-hidden` của panel CẮT CỤT — 2-3 nút cuối biến mất khỏi
            màn và KHÔNG có cách nào với tới (không cuộn được, không có menu
            thay thế). Đo thực tế: thanh soạn cây ~680px trong card ~510px trên
            iPad mini dọc.

            `max-lg:shrink` + `max-lg:min-w-0` cho hộp hẹp lại dưới bề rộng nội
            dung, `overflow-x-auto` biến phần dư thành CUỘN thay vì mất hẳn —
            đúng thứ tự ưu tiên "cuộn, không ẩn" của `ipad-responsive.md §4`.

            ⛔ `overscroll-x-contain` bắt buộc đi kèm: thiếu nó, vuốt hết thanh
            là Safari hiểu thành cử chỉ "lùi lại trang trước" và đẩy người dùng
            ra khỏi màn đang làm việc. Trên PC vô hại (chuột không sinh cử chỉ
            vuốt biên) — và cả cụm `max-lg:` vốn không bao giờ khớp trên laptop
            (hẹp nhất 1280px).
          */}
          {headerRight && (
            <div className="scrollbar-hidden flex shrink-0 items-center gap-3 max-lg:min-w-0 max-lg:shrink max-lg:overflow-x-auto max-lg:overscroll-x-contain touch:min-w-0 touch:shrink touch:overflow-x-auto touch:overscroll-x-contain">
              {headerRight}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className={cn(slots.body(), bodyClassName)}>{children}</div>

      {/* ── Footer (conditional) ── */}
      {footer !== undefined && <div className={slots.footer()}>{footer}</div>}
    </div>
  );
});

BoxPanel.displayName = 'BoxPanel';

export default BoxPanel;
