import { memo, type CSSProperties, type ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import type { TitleIconColor } from './TitleScreen';

/**
 * Size axis — geometry + type scale của header.
 *  - `md` (default): h-10 (40px), title 14px gradient tone. Diện mạo cũ, KHÔNG đổi.
 *  - `sm`: h-8 (32px), title 12px bold màu ĐẶC. Dùng cho panel dày dữ liệu
 *    (donut + legend) khi header chỉ là nhãn, không phải điểm nhấn.
 *
 * Vì sao `sm` bỏ gradient chữ: `background-clip: text` buộc browser rasterize
 * glyph qua mask → tắt subpixel-antialias, chữ mềm. Ở 12px điều đó thấy rõ, nên
 * `sm` dùng `text-fg-1` đặc để nét tối đa.
 */
const styles = tv(
  {
    slots: {
      // `flex items-center` ở root → inner (không còn `h-full`) tự căn giữa
      // dọc khi root cao hơn inner (min-h-* > content + padding). Absolute
      // children (hairline, stripe) không bị ảnh hưởng vì out-of-flow.
      root: 'relative flex shrink-0 items-center overflow-hidden',
      /**
       * Không `h-full`: inner grow theo padding override (vd `p-1`). Flex-1
       * để inner chiếm hết bề ngang root (nếu không, inner co lại theo content).
       *
       * ⛔ `min-w-0` CHỈ Ở BẬC `max-lg:` (< 1024px) — KHÔNG để ở bậc nền.
       *    Flex item mặc định có `min-width: auto` = KHÔNG co được dưới
       *    min-content. Min-content của hàng này = 3 vạch chéo + slot action
       *    (`shrink-0`) + tiêu đề; trên máy tính bảng dọc tổng đó vượt bề ngang
       *    panel ⇒ inner tràn ra ngoài root, mà root `overflow-hidden` nên mấy
       *    nút cuối bị XÉN CỤT. `min-w-0` trả lại quyền co cho hàng, phần dôi
       *    xử lý bằng CUỘN ở slot action — đúng thứ tự ưu tiên "cuộn, không ẩn"
       *    của `ipad-responsive.md` §4.
       *
       *    Nhưng ở bậc nền thì nó đổ xuống CẢ laptop, nơi hàng vốn đang vừa
       *    chỗ — cho phép co thêm chỉ tạo cơ hội cắt ngắn breadcrumb/nav do
       *    page tự dựng mà không giải quyết vấn đề nào. Vì thế gate `max-lg:`.
       */
      inner: 'relative z-10 flex flex-1 items-center max-lg:min-w-0 touch:min-w-0',
      bar: 'w-[3px] -skew-x-[20deg]',
      title: 'min-w-0 flex-1 truncate uppercase tracking-wide',
    },
    variants: {
      size: {
        md: {
          /**
           * `min-h-*` (không `h-*`): caller override `innerClassName="p-2"` sẽ
           * GROW được header — `h-*` fixed sẽ ăn hết padding vertical.
           *
           * `touch:min-h-10` (40px) — máy tính bảng. Header này chứa cụm nút
           * hành động của panel; ở 32px thì nút bên trong bị bó, không đủ chỗ
           * cho hộp chạm 32px + đệm dọc. 40px là sàn "hàng bấm được" của
           * `ipad-responsive.md` §3.2. `touch:` không bao giờ khớp trên
           * PC/laptop ⇒ desktop giữ nguyên 32px từng pixel một.
           */
          root: 'min-h-8',
          inner: 'gap-2 px-3 max-lg:gap-1.5 max-lg:px-2',
          bar: 'h-3',
          /**
           * ⛔ MÁY TÍNH BẢNG HẠ CỠ CHỮ TIÊU ĐỀ 14 → 12px — `max-lg:` (iPad dọc,
           *    < 1024px) VÀ `touch:` (iPad ở mọi bề rộng, kể cả nằm ngang).
           *
           * Hàng này là [3 vạch] [TIÊU ĐỀ] [cụm nút]. Tiêu đề module dài
           * ("HIỆN TRƯỜNG TRƯỚC THI CÔNG" ≈ 230px @14px) trong khi cụm nút bên
           * phải là `shrink-0`; trên iPad dọc tổng hai thứ vượt bề ngang panel
           * nên tiêu đề bị truncate cụt còn 2-3 chữ và nằm sát rạt cụm nút —
           * đọc ra như chữ chồng lên nút. Hạ MỘT bậc chữ trả lại ~15% bề ngang
           * cho tiêu đề mà KHÔNG đụng chiều cao hàng (vùng chạm vẫn
           * `touch:min-h-10` = 40px).
           *
           * GATE BẰNG CẢ HAI BẬC — hai ca khác nhau, thiếu vế nào cũng sót:
           *
           *  · `max-lg:` (< 1024px) — chuyện HẾT CHỖ thuần tuý. Cắm chuột vào
           *    iPad dọc thì vẫn hết chỗ y hệt (ipad-responsive.md §8.1), nên ca
           *    này KHÔNG được gate bằng `touch:`.
           *
           *  · `touch:` — iPad NẰM NGANG (Air 11" = 1180px · Pro 13" = 1366px)
           *    đều LỚN HƠN 1024px nên `max-lg:` KHÔNG khớp, trong khi cụm nút
           *    bên phải lại PHÌNH RA vì vùng chạm được nới (nút icon 20→32px,
           *    hàng 32→40px). Chỗ trống cho tiêu đề vì thế còn HẸP HƠN cả iPad
           *    dọc, mà chữ vẫn giữ 14px ⇒ tiêu đề cụt sát rạt cụm nút, đọc ra
           *    như chữ chồng lên nút — đúng lỗi đã báo ở phân hệ Hồ sơ.
           *
           * Phụ thêm: có `touch:` thì XOAY MÁY không làm tiêu đề nhảy cỡ —
           * trước đó iPad dọc 12px mà xoay ngang lại vọt về 14px.
           *
           * Cả hai đều KHÔNG BAO GIỜ khớp trên laptop (hẹp nhất 1280px, và luôn
           * có con trỏ) ⇒ PC giữ nguyên từng pixel.
           */
          title: 'text-body-14-semibold max-lg:text-caption-12-semibold',
        },
        sm: {
          root: 'min-h-8',
          inner: 'gap-1.5 px-2',
          bar: 'h-2.5',
          title: 'text-caption-12-bold text-fg-1',
        },
      },
      /**
       * Kiểu tô chữ tiêu đề — độc lập với `size`:
       *  - `gradient` (default): trắng → tone, giữ nguyên diện mạo cũ.
       *  - `solid`: `text-fg-1` (#FFF) đặc. Dùng cho màn hình dày dữ liệu
       *    (trang quản lý số liệu) — xem ghi chú `sm` ở trên: gradient buộc
       *    browser rasterize glyph qua mask nên chữ mềm và nhạt hơn.
       */
      titleVariant: {
        gradient: {},
        solid: { title: 'text-fg-1' },
      },
    },
    defaultVariants: { size: 'md', titleVariant: 'gradient' },
  },
  // `text-caption-12-bold` là font-size token, KHÔNG phải màu — nếu thiếu config
  // này tailwind-merge sẽ để `text-fg-1` nuốt mất cỡ chữ (xem tailwind-conventions.md).
  { twMergeConfig: twMergeFontExtend },
);

export type DetailPanelHeaderSize = NonNullable<VariantProps<typeof styles>['size']>;
export type DetailPanelHeaderTitleVariant = NonNullable<
  VariantProps<typeof styles>['titleVariant']
>;

export interface DetailPanelHeaderProps {
  /** Tiêu đề (uppercase, semibold). ReactNode để tương thích `BoxPanel.title`. */
  title: ReactNode;
  /** Slot hành động phải (thường là icon-button). Không truyền → chỉ hiển thị title. */
  action?: ReactNode;
  /** Mật độ header. `md` (default) = 40px · `sm` = 32px + chữ đặc, nét hơn. */
  size?: DetailPanelHeaderSize;
  /**
   * Kiểu tô chữ tiêu đề. `gradient` (default) giữ diện mạo cũ; `solid` cho chữ
   * trắng đặc — nét và tương phản cao hơn, dùng ở màn hình quản lý số liệu.
   * Chỉ có tác dụng khi `title` là string (ReactNode tự quản màu của nó).
   */
  titleVariant?: DetailPanelHeaderTitleVariant;
  /**
   * Tone của header — khớp `iconColor` của TitleScreen / tone của `HudFrame`
   * bọc ngoài. Default `sky` (giữ nguyên diện mạo cũ).
   */
  tone?: TitleIconColor;
  /**
   * Bật corner brackets [ ] 4 góc. Default `false`: panel thường đã được
   * `HudFrame` bọc ngoài (đã có bracket ở góc khung) → bật thêm ở header sẽ
   * ra 2 lớp bracket chồng nhau, rối. Chỉ bật khi header đứng một mình.
   */
  brackets?: boolean;
  /** Override outer classes (không phá recipe base). */
  className?: string;
  /**
   * Override inner (flow layer chứa title + action) — tinh chỉnh padding/gap
   * khi panel dense (vd `p-1` để header sát vạch tone bên trái, giữ nhiều chỗ
   * cho action như MultiSelect trong site-clearance summary).
   */
  innerClassName?: string;
}

/**
 * Nền header: CHỈ tint tone loang từ TRÁI sang, tắt hẳn ở ~55% chiều rộng.
 *
 * ⚠️ Sọc chéo (repeating-linear-gradient) KHÔNG nằm ở đây — nó là lớp riêng có
 * mask, giới hạn trong ~140px mép trái. Trước đó sọc trải full-width nên một
 * trang có 3-4 panel là thành "rừng sọc", chữ khó đọc (feedback thực tế).
 */
const bandStyle = (tone: TitleIconColor): CSSProperties => ({
  backgroundImage: `linear-gradient(to right,
    color-mix(in srgb, var(--color-${tone}-5) 26%, transparent) 0%,
    color-mix(in srgb, var(--color-${tone}-5) 8%, transparent) 28%,
    transparent 55%)`,
});

/** Lớp sọc chéo — mask cứng, chỉ hiện ở dải hẹp sát mép trái. */
const stripeStyle = (tone: TitleIconColor): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(122deg,
    transparent 0 14px,
    color-mix(in srgb, var(--color-${tone}-5) 12%, transparent) 14px 28px)`,
  WebkitMaskImage: 'linear-gradient(to right, black 0, black 60px, transparent 140px)',
  maskImage: 'linear-gradient(to right, black 0, black 60px, transparent 140px)',
});

/** Chữ tiêu đề gradient trắng → tone (đọc rõ nhưng có chất big-screen). */
const titleStyle = (tone: TitleIconColor): CSSProperties => ({
  backgroundImage: `linear-gradient(180deg, var(--color-fg-1) 35%, color-mix(in srgb, var(--color-${tone}-3) 75%, var(--color-fg-1)) 100%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
});

/**
 * DetailPanelHeader — cyber-style panel header (Figma 10144-464978).
 *
 * Layout (root `relative h-10` ở `size="md"`, `h-8` ở `size="sm"`):
 *  - Top: hairline `absolute top-0` — 48px chip tone + fading tone line
 *  - Middle: `h-full` flow layer — 3 vạch chéo + title uppercase + action slot
 *  - Bottom: hairline `absolute bottom-0` — 3 dots + fading tone line
 *
 * Hairline ghim bằng absolute (không phải flex row) → header không vỡ bố cục khi
 * chiều cao lệch khỏi mặc định (padding từ `className`, caller override…).
 * `title` là string → bọc `<span>` truncate; là ReactNode → render trần trong `<div>`
 * (KHÔNG bọc `<p>`: breadcrumb/nav là block element, nesting sai + bị truncate bóp).
 */
const DetailPanelHeader = memo(function DetailPanelHeader({
  title,
  action,
  tone = 'sky',
  size = 'md',
  titleVariant = 'gradient',
  brackets = false,
  className,
  innerClassName = 'py-1',
}: DetailPanelHeaderProps) {
  const toneVar = `var(--color-${tone}-5)`;
  const lineFade = `linear-gradient(to right, transparent 0%, color-mix(in srgb, ${toneVar} 50%, transparent) 50%, transparent 100%)`;
  const bracketCls = 'pointer-events-none absolute z-20 size-2 border-secondary-5';
  const slots = styles({ size, titleVariant });
  // `sm` vốn đã là chữ đặc → chỉ `md` + `gradient` mới cần background-clip.
  const useGradientTitle = size === 'md' && titleVariant === 'gradient';

  return (
    <div className={slots.root({ class: className })} style={bandStyle(tone)}>
      {/* Sọc chéo — lớp riêng, mask giới hạn ~140px mép trái (chống rối). */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={stripeStyle(tone)} />

      {/* Top hairline — 48px chip tone + fading line (ghim mép trên) */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center">
        <div className="h-px w-12 shrink-0" style={{ background: toneVar }} />
        <div className="h-px flex-1" style={{ background: lineFade }} />
      </div>

      {/* Corner brackets [ ] — universal Chinese big-screen pattern (BigDataView
          templates 003/009/020/025). Đặt sát 4 góc, kích thước 8px. */}
      {brackets && (
        <>
          <span
            aria-hidden
            className={cn(bracketCls, 'left-0 top-0 border-l-[1.5px] border-t-[1.5px]')}
          />
          <span
            aria-hidden
            className={cn(bracketCls, 'right-0 top-0 border-r-[1.5px] border-t-[1.5px]')}
          />
          <span
            aria-hidden
            className={cn(bracketCls, 'bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]')}
          />
          <span
            aria-hidden
            className={cn(bracketCls, 'bottom-0 right-0 border-b-[1.5px] border-r-[1.5px]')}
          />
        </>
      )}

      {/* Middle — 3 vạch chéo + title + action slot (chiếm trọn chiều cao).
          Bump opacity (55→72, 25→42) để 3 vạch nổi rõ trên bg tint.
          `cn()` để đảm bảo tailwind-merge override đúng `px-*`/`gap-*` từ recipe
          khi caller truyền `innerClassName` (vd `p-1 gap-1`). */}
      <div className={cn(slots.inner(), innerClassName)}>
        <span aria-hidden className="flex shrink-0 items-center gap-[3px]">
          <span
            className={slots.bar()}
            style={{ background: toneVar, boxShadow: `0 0 6px ${toneVar}` }}
          />
          <span
            className={slots.bar()}
            style={{ background: `color-mix(in srgb, ${toneVar} 72%, transparent)` }}
          />
          <span
            className={slots.bar()}
            style={{ background: `color-mix(in srgb, ${toneVar} 42%, transparent)` }}
          />
        </span>

        {typeof title === 'string' ? (
          // Chữ đặc (từ recipe) khi `sm` hoặc `titleVariant="solid"` → nét nhất;
          // còn lại giữ gradient tone như thiết kế gốc.
          <span className={slots.title()} style={useGradientTitle ? titleStyle(tone) : undefined}>
            {title}
          </span>
        ) : (
          /*
            ⛔ `overflow-hidden` CHẶN "TIÊU ĐỀ ĐÈ LÊN NÚT" — nhưng CHỈ ở bậc
            `max-lg:` (< 1024px). Ở bậc nền nó đổ xuống cả laptop và có thể CẮT
            CỤT breadcrumb / thanh nav do page tự dựng trong slot `title` này,
            trong khi trên laptop hàng vốn đang đủ chỗ, không có gì để chặn.

            `title` dạng ReactNode thường là breadcrumb / thanh nav do page tự
            dựng, và nội dung bên trong KHÔNG chắc đã co được (ví dụ
            `ContentBreadcrumb` từng khai `shrink-0`). Hộp này `min-w-0` nên
            bản thân nó co về 0 đúng như mong muốn, NHƯNG nội dung tràn ra vẫn
            được VẼ — nó chảy sang đúng vùng của slot action đứng ngay sau, và
            vì action nằm sau trong DOM nên nút được vẽ ĐÈ LÊN chữ. Kết quả
            đọc ra là "tiêu đề và nút chồng lên nhau" (lỗi đã gặp ở header bảng
            nội dung phân hệ Hồ sơ trên máy tính bảng).

            Cắt phần tràn ở đây là chữa ĐÚNG chỗ: hộp tự cắt phần của mình, thay
            vì lấn sang hàng xóm. Việc "tràn thì làm gì" là của chính nội dung
            bên trong (truncate hoặc cuộn ngang) — xem `ContentBreadcrumb`.
          */
          <div className="min-w-0 flex-1 max-lg:overflow-hidden touch:overflow-hidden">{title}</div>
        )}
        {/*
          Action BẮT BUỘC `shrink-0`: control kit2 (Dropdown/Select) có `w-full`
          ở trigger → nếu để làm flex child trần nó sẽ giãn hết header và bóp
          title về 0.

          ⛔ BẬC `max-lg` (<1024px — MÁY TÍNH BẢNG DỌC) LẬT NGƯỢC QUY TẮC ĐÓ.
          Tiêu đề co hết cỡ rồi mà cụm nút vẫn dài hơn panel thì phần dư bị
          `overflow-hidden` của root CẮT CỤT — 2-3 nút cuối biến mất khỏi màn và
          KHÔNG có đường nào với tới (không cuộn được, không có menu thay thế).

          `max-lg:min-w-0` + `max-lg:shrink` cho hộp hẹp lại dưới bề rộng nội
          dung, `overflow-x-auto` biến phần dư thành CUỘN thay vì mất hẳn — đúng
          thứ tự ưu tiên "cuộn, không ẩn" (`ipad-responsive.md` §4). Cùng cách
          `BoxPanel` đã xử lý cho header phẳng của nó.

          ⛔ `overscroll-x-contain` bắt buộc đi kèm: thiếu nó, vuốt hết cụm nút
          là Safari hiểu thành cử chỉ "lùi lại trang trước" và đẩy người dùng ra
          khỏi màn đang làm việc. Trên PC vô hại (chuột không sinh cử chỉ vuốt
          biên) — và `max-lg:` vốn không bao giờ khớp trên laptop (hẹp nhất
          1280px).

          ⛔ BỔ SUNG BẬC `touch:` — `max-lg:` MỘT MÌNH LÀ CHƯA ĐỦ.
          iPad Air 11" nằm ngang = 1180px và iPad Pro 13" nằm ngang = 1366px,
          cả hai đều LỚN HƠN 1024px nên `max-lg:` KHÔNG khớp ⇒ cụm nút quay
          lại `shrink-0` không cuộn, và phần dôi bị `overflow-hidden` của root
          xén cụt y như cũ. `touch:` khớp theo NGÓN TAY nên phủ iPad ở MỌI bề
          rộng mà vẫn không bao giờ chạm laptop 1366px.

          ⚠️ `scrollbar-hidden` để TRẦN (không tiền tố `max-lg:`) là CỐ Ý: nó là
          class CSS thường khai trong `globals.css`, KHÔNG phải `@utility` của
          Tailwind nên biến thể breakpoint không sinh ra rule cho nó. Để trần
          vẫn vô hại trên desktop — ở đó hộp này không bao giờ cuộn (`shrink-0`,
          không có `overflow`) nên `scrollbar-width: none` không có gì để ẩn.
        */}
        {action && (
          <div className="scrollbar-hidden flex shrink-0 items-center gap-2 max-lg:min-w-0 max-lg:shrink max-lg:overflow-x-auto max-lg:overscroll-x-contain touch:min-w-0 touch:shrink touch:overflow-x-auto touch:overscroll-x-contain">
            {action}
          </div>
        )}
      </div>

      {/* Bottom hairline — 3 dots + fading line (ghim mép dưới) */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-[2px]">
          <div className="h-px w-2 bg-secondary-6" />
          <div className="h-px w-2 bg-secondary-5" />
          <div className="h-px w-2 bg-secondary-4" />
        </div>
        <div className="h-px flex-1" style={{ background: lineFade }} />
      </div>
    </div>
  );
});

DetailPanelHeader.displayName = 'DetailPanelHeader';

export default DetailPanelHeader;
