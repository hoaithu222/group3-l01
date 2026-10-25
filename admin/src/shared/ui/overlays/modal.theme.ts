/**
 * modal.theme.ts — recipes tập trung cho toàn bộ hệ modal.
 *
 * Hướng thiết kế **"Elevated Command Console"** — pha dashboard 大屏 + trading
 * terminal. Bốn ý chính:
 *  1. Trang trí chỉ ở KHUNG, vùng nội dung để trống.
 *  2. DEPTH nhiều lớp (halo brand + drop shadow sâu + inset accent) → panel
 *     "nhấc" khỏi overlay.
 *  3. NGÔN NGỮ tia sáng — ray đỉnh panel · viền dưới header · hairline footer.
 *  4. VÁT GÓC 45° — ở header (`headerBand`) cho modal thường, ở cả 4 góc panel
 *     cho `frame="hud"` (ConfirmDialog). Đây là chi tiết nhận diện của hệ.
 *
 * Token dùng: `primary-5` (brand, viền + ray) · `teal-5` (inner glow phụ) ·
 * `neutral-0` (high-light 1px) · `bg-dialog` / `bg-dialog-2` (nền) ·
 * `popup-shadow` (đổ bóng ngoài).
 *
 * ⚠️ MỌI màu đi qua `var(--color-*)` + `color-mix()` — KHÔNG `rgba()` hardcode.
 * ⚠️ KHÔNG đổi tên slot — Modal.tsx · FormModal.tsx · CustomModalLayout.tsx
 * tiêu thụ qua object destructuring; đổi tên = break.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Overlay dùng chung cho Modal / FormModal / Drawer — kiểu KÍNH MỜ:
 * vẫn NHÌN THẤY dashboard phía sau nhưng đã nhoè hẳn, không đọc được chữ.
 *
 * ⚠️ Cân bằng 2 tham số, đừng chỉnh lẻ một cái:
 *   - `black/45` (trước là /75) — /75 phủ gần kín, nền chỉ còn là mảng đen,
 *     mất hết ngữ cảnh "mình đang đứng ở màn hình nào".
 *   - `blur-[12px]` (trước 10px) — bù lại cho việc hạ độ phủ: nền sáng hơn thì
 *     phải nhoè mạnh hơn, nếu không chữ/số phía sau vẫn đọc lõm bõm và tranh
 *     mất chú ý với modal.
 *   - `saturate-125` — dưới lớp phủ đen màu bị xỉn; kéo bão hoà lên để nền nhoè
 *     ra "kính mờ có màu" thay vì "vũng xám bẩn".
 *
 * Đây là lớp phủ CHUNG của MỌI lớp nổi toàn màn: Modal · FormModal · Drawer.
 * `drawer.theme.ts` nhập `MODAL_OVERLAY_BASE` từ đây thay vì chép lại, nên đổi
 * tông ở một chỗ là cả ba đổi theo — trước đây hai file chỉ "hẹn nhau" bằng
 * chú thích, mà mở Modal và Drawer cùng lúc thì lệch tông lộ ra ngay.
 */

/** Vị trí + nền + kính mờ. KHÔNG chứa animation (mỗi lớp nổi vào/ra một kiểu). */
export const MODAL_OVERLAY_BASE =
  'fixed inset-0 z-50 bg-black/45 backdrop-blur-[12px] backdrop-saturate-125';

export const MODAL_OVERLAY_CLASS = [
  MODAL_OVERLAY_BASE,
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
].join(' ');

/** Khung panel + trang trí (topRail + texture + 4 corner ngoặc). */
export const modalStyles = tv({
  slots: {
    panel: [
      'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
      // ⚠️ `overflow-visible` (KHÔNG phải hidden) để 4 ngoặc góc vẽ được RA
      // NGOÀI viền panel. Cắt nội dung đã có sẵn ở tầng dưới: `modalLayoutStyles.root`
      // (FormModal) + slot `body` (`overflow-auto`) — panel không cần cắt thêm.
      // Đổi lại `overflow-hidden` = ngoặc góc bị xén mất.
      'flex flex-col overflow-visible outline-none',
      // ⛔ `touch:` DÙNG `dvh`, KHÔNG PHẢI `vh`.
      // Safari trên iPad tính `100vh` theo lúc thanh URL + thanh công cụ ĐÃ THU
      // LẠI, tức LỚN HƠN vùng thực sự nhìn thấy ~60-90px. Modal cao kịch trần
      // (form thêm kế hoạch, nhập Excel…) vì thế thò xuống dưới thanh công cụ,
      // kéo theo hàng nút "Huỷ / Lưu" ở chân modal RA NGOÀI MÀN — người dùng
      // không thấy, cũng không cuộn tới được (panel `fixed`, đã canh giữa).
      // `dvh` bám đúng vùng nhìn thấy hiện tại nên chân modal luôn nằm trong màn.
      //
      // Trên mọi trình duyệt máy tính `dvh === vh` (không có thanh công cụ co
      // giãn) và `touch:` vốn không bao giờ khớp ở đó ⇒ desktop KHÔNG đổi.
      'max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] touch:max-h-[calc(100dvh-32px)]',
      // Gradient nền: đỉnh sáng hơn thân → panel "elevated" (không phẳng).
      'bg-gradient-to-b from-bg-dialog-2 via-bg-dialog to-bg-dialog',
      'border-2 border-primary-5/45',
      // Shadow xếp lớp, ngoài → trong: halo mảnh sát viền · drop shadow sâu ·
      // bóng phụ · quầng brand inset · high-light 1px mép trên.
      //
      // ⚠️ NGÂN SÁCH ÁNH SÁNG XANH — đừng nống lên lại. Bản trước có tới BA lớp
      // xanh chồng nhau (halo 18% + inset brand 64px/28% + inset teal 40px/26%);
      // cộng với `border-2` sáng, mắt đọc ra một dải phát sáng dày quanh panel
      // chứ không ra "viền sắc". Nay: halo 10%, MỘT lớp inset duy nhất 36px
      // spread −26px (chỉ liếm mép, không loang vào thân), BỎ HẲN lớp teal.
      // Độ nổi do 2 drop shadow trung tính lo — không cần glow màu để "nổi".
      'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_10%,transparent),0_32px_80px_-12px_var(--color-popup-shadow),0_12px_32px_-16px_var(--color-popup-shadow),inset_0_0_36px_-26px_color-mix(in_srgb,var(--color-primary-5)_18%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-0)_8%,transparent)]',
      // zoom-in-95 + trượt lên 2px → panel "dâng lên", không pop thô.
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      'data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2',
    ],
    /**
     * Ray sáng mép trên panel — "signature line" của hệ modal.
     * ⚠️ z-10: header band đứng SAU trong DOM và cũng `relative` → không nâng z
     * thì band đè mất ray + ngoặc góc trên.
     */
    topRail: [
      'pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px]',
      'bg-gradient-to-r from-transparent via-primary-5 to-transparent',
      // Quầng hạ từ 8px/55% → 5px/28%: ray đã sáng sẵn, quầng to chỉ làm nhoè.
      'shadow-[0_1px_5px_color-mix(in_srgb,var(--color-primary-5)_28%,transparent)]',
    ],
    /**
     * Lưới kỹ thuật 28px phủ nền — cùng ngôn ngữ với grid chart dashboard. Mask
     * tan ở 62% chiều cao: đọc được ở vùng tiêu đề, không nhiễu vùng nhập liệu.
     *
     * ⚠️ Alpha lấy qua `text-primary-5` + `opacity-*`, KHÔNG `color-mix` trong
     * gradient: Lightning CSS sinh fallback màu ĐẶC cho trình duyệt thiếu
     * `color-mix` → lưới sẽ xanh chói 100%. `-webkit-mask-image` tự thêm.
     */
    texture: [
      'pointer-events-none absolute inset-0 text-primary-5 opacity-[0.04] dark:opacity-[0.055]',
      '[background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)]',
      '[background-size:28px_28px]',
      '[mask-image:linear-gradient(to_bottom,black,transparent_62%)]',
    ],
    /**
     * Ngoặc góc — 4 góc panel, border 2px.
     *
     * ⚠️ `-m-2` KHÔNG phải để "cho đẹp" — nó là thứ làm ngoặc ĐỌC RA ngoặc.
     * Element absolute tính từ PADDING BOX, tức ngay bên trong `border-2`. Để
     * `m-0` thì viền 2px và ngoặc 2px dính liền → góc thành dải 4px đậm, nhìn
     * ra "góc bị dày" chứ không ra chi tiết trang trí.
     *
     * Cách tính (đo từ mép ngoài panel, dương = vào trong):
     *   padding box ở  +2px  →  margin −8px  →  mép ngoài ngoặc ở −6px
     *   nét ngoặc 2px nằm ở  −6px … −4px
     *   ⇒ ngoặc nằm HẲN NGOÀI panel, chừa khe hở 4px với viền. Khung kép.
     *
     * ⚠️ Chỉ chạy được vì `panel` để `overflow-visible`. Ai đổi lại
     * `overflow-hidden` là 4 ngoặc biến mất.
     *
     * ⚠️ Quầng 3px/20% thôi: 4 góc đều phát sáng mạnh thì cộng với halo panel
     * thành viền "cháy" (xem §NGÂN SÁCH ÁNH SÁNG XANH ở `panel`).
     */
    corner: [
      'pointer-events-none absolute z-10 -m-2 size-6 border-primary-5/70',
      '[filter:drop-shadow(0_0_3px_color-mix(in_srgb,var(--color-primary-5)_20%,transparent))]',
    ],
    /**
     * ── KHUNG HUD (chỉ dùng ở `frame="hud"`) ─────────────────────────────────
     * `frameEdge` = lớp màu viền · `frameFill` = lớp nền phủ lên, chừa đúng 2px
     * → ra đường viền ôm trọn hình VÁT 4 GÓC (`border` thường không đi theo
     * `clip-path` nên buộc phải làm 2 lớp).
     *
     * ⚠️ TOẠ ĐỘ ĐÃ TÍNH SẴN, đừng "làm tròn cho đẹp":
     *   vát ngoài 18px · viền 2px → đường vát trong lệch vào 2√2 ≈ 2.83
     *   ⇒ đỉnh trong = 18 + 2.83 − 2 = 18.83px.
     *   Lấy đại 16px/20px thì viền chỗ vát sẽ dày/mỏng khác hẳn viền thẳng.
     *
     * Cả hai lớp nằm ở z ÂM → panel background vẽ trước, rồi khung, rồi tới
     * `texture` / nội dung (z auto) — không cần đụng DOM order ở component.
     */
    frameEdge: [
      'pointer-events-none absolute inset-0 -z-20',
      '[clip-path:polygon(18px_0,calc(100%-18px)_0,100%_18px,100%_calc(100%-18px),calc(100%-18px)_100%,18px_100%,0_calc(100%-18px),0_18px)]',
      'bg-[linear-gradient(150deg,color-mix(in_srgb,var(--hud,var(--color-primary-5))_95%,transparent),color-mix(in_srgb,var(--hud,var(--color-primary-5))_40%,transparent)_48%,color-mix(in_srgb,var(--hud,var(--color-primary-5))_95%,transparent))]',
    ],
    // Gradient dừng sớm (45%) → chỉ đỉnh panel sáng nhẹ, 55% còn lại là navy
    // đặc. Nếu để `via-bg-dialog` giữa thân như panel thường thì cả tấm bị
    // xám nhạt, chữ trắng và gem mất tương phản.
    frameFill: [
      'pointer-events-none absolute inset-0 -z-10',
      '[clip-path:polygon(18.83px_2px,calc(100%-18.83px)_2px,calc(100%-2px)_18.83px,calc(100%-2px)_calc(100%-18.83px),calc(100%-18.83px)_calc(100%-2px),18.83px_calc(100%-2px),2px_calc(100%-18.83px),2px_18.83px)]',
      'bg-gradient-to-b from-bg-dialog-2 to-bg-dialog to-45%',
    ],
    /**
     * Đoạn viền sáng giữa cạnh trên/dưới — chi tiết "mối nối" của khung HUD.
     * Vẽ SAU `frameFill` (cùng -z-10) nên đè lên viền, tạo điểm sáng mạnh hơn.
     */
    frameTick: [
      'pointer-events-none absolute left-1/2 -z-10 h-[2px] w-24 -translate-x-1/2',
      'bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--hud,var(--color-primary-5))_100%,transparent)] to-transparent',
      'shadow-[0_0_10px_color-mix(in_srgb,var(--hud,var(--color-primary-5))_60%,transparent)]',
    ],
  },
  variants: {
    at: {
      tl: { corner: 'left-0 top-0 border-l-2 border-t-2' },
      tr: { corner: 'right-0 top-0 border-r-2 border-t-2' },
      bl: { corner: 'bottom-0 left-0 border-b-2 border-l-2' },
      br: { corner: 'bottom-0 right-0 border-b-2 border-r-2' },
    },
    tick: {
      top: { frameTick: 'top-0' },
      bottom: { frameTick: 'bottom-0' },
    },
    /**
     * `default` — khung chữ nhật viền brand (Modal / FormModal).
     * `hud`     — khung vát 4 góc (ConfirmDialog). Màu đọc từ `--hud`, mặc định
     *             brand green; để ngỏ biến này phòng khi cần khung màu khác,
     *             NHƯNG mặc định phải giữ brand — xem `confirm-dialog.theme.ts`
     *             §PHÂN VAI MÀU (màu ngữ nghĩa chỉ ở icon + nút).
     */
    frame: {
      default: {},
      hud: {
        panel: [
          'border-0',
          '[clip-path:polygon(18px_0,calc(100%-18px)_0,100%_18px,100%_calc(100%-18px),calc(100%-18px)_100%,18px_100%,0_calc(100%-18px),0_18px)]',
          // ⚠️ box-shadow NGOÀI bị `clip-path` cắt sạch → panel mất độ nổi. Giữ
          // phần inset và chuyển đổ bóng sang `drop-shadow` filter (filter chạy
          // SAU clip-path nên bóng bám đúng hình vát).
          // ⚠️ Quầng inset RẤT nhẹ (18%): bản trước 60% → màu loang khắp panel,
          // nền navy bị nhuộm, nhìn "đục". Màu chỉ được đọng ở viền.
          'shadow-[inset_0_0_72px_-34px_color-mix(in_srgb,var(--hud,var(--color-primary-5))_18%,transparent)]',
          '[filter:drop-shadow(0_28px_56px_var(--color-popup-shadow))_drop-shadow(0_0_16px_color-mix(in_srgb,var(--hud,var(--color-primary-5))_26%,transparent))]',
        ],
        // Ray brand ngang đỉnh trùng với viền khung HUD → tắt cho đỡ rối.
        topRail: 'hidden',
        // Ngoặc góc lùi vào trong 7px cho khỏi rơi vào phần đã vát — đọc ra
        // "đường viền kép ở góc" như mẫu. Mảnh + mờ hơn viền chính để là chi
        // tiết phụ, không tranh chấp với đường viền.
        corner: [
          'm-[7px] size-9',
          'border-[color-mix(in_srgb,var(--hud,var(--color-primary-5))_45%,transparent)]',
          '[filter:none]',
        ],
      },
    },
  },
  defaultVariants: {
    frame: 'default',
  },
});

/** Header · body · footer bên trong khung panel. */
export const modalLayoutStyles = tv(
  {
    slots: {
      root: 'flex w-full flex-col overflow-hidden',
      /**
       * Header — chỉ lo LAYOUT (padding, flex, ngăn co). Toàn bộ phần NHÌN THẤY
       * (nền + viền vát) do cặp `headerBand` / `headerBandFill` vẽ ở dưới, vì
       * clip-path vát góc phải áp lên element riêng để không cắt mất nội dung.
       */
      header: 'relative flex shrink-0 items-center justify-between gap-3 px-4',
      /**
       * ── VÁT GÓC HEADER — lớp NGOÀI = màu viền ────────────────────────────────
       *   ┌──────────────────────────┐
       *   │  ▌ UPLOAD THƯ MỤC     ✕  │
       *   └───────────────────────╲──┘  ← cắt 45° ở góc dưới-phải (16px)
       *
       * Cùng kỹ thuật "clip-path border" như `frameEdge`/`frameFill`: 2 lớp cùng
       * hình vát, lớp trong thụt 1.5px → accent lòi ra thành viền ôm cạnh dưới +
       * cạnh chéo (`border` thường KHÔNG đi theo clip-path).
       * `drop-shadow` chứ không box-shadow: filter chạy SAU clip-path nên quầng
       * sáng bám đúng silhouette đã vát.
       */
      headerBand: [
        'pointer-events-none absolute inset-0',
        '[clip-path:polygon(0_0,100%_0,100%_calc(100%-16px),calc(100%-16px)_100%,0_100%)]',
        'bg-gradient-to-r from-primary-5/30 via-primary-5/55 to-primary-5/85',
        '[filter:drop-shadow(0_1px_4px_color-mix(in_srgb,var(--color-primary-5)_16%,transparent))]',
      ],
      /**
       * Lớp TRONG của band — thụt 1.5px ở cạnh phải + dưới, chamfer 15px (thay vì
       * 16px) để đường vát song song và cách đều lớp ngoài ~1.4px.
       * ⚠️ Sửa 16px ở `headerBand` thì PHẢI sửa 15px ở đây, nếu không viền vát bị
       * dày/mỏng lệch so với viền ngang.
       * ⚠️ Gradient BẮT BUỘC dùng 2 màu ĐẶC (không alpha): fill trong suốt thì
       * lớp accent bên dưới lộ hết → header thành một mảng xanh đặc thay vì
       * dải tối viền xanh.
       */
      headerBandFill: [
        'pointer-events-none absolute left-0 top-0 bottom-[1.5px] right-[1.5px]',
        '[clip-path:polygon(0_0,100%_0,100%_calc(100%-15px),calc(100%-15px)_100%,0_100%)]',
        'bg-gradient-to-b from-bg-dialog-2 to-bg-dialog',
      ],
      /**
       * Vạch accent dọc trước tiêu đề — w-[3px] + glow.
       *
       * ⛔ CHIỀU CAO không còn phải khớp tay với line-height của `title`. Trước
       * đây là `h-4` + `mt-1` cố định — con số ăn khớp ĐÚNG với line-box 20px
       * của `text-body-14-semibold`; đổi cỡ chữ tiêu đề là vạch lệch ngay (đã
       * xảy ra: tiêu đề nâng lên `body-16` mà vạch giữ nguyên số cũ). Giờ vạch
       * + tiêu đề nằm trong MỘT hàng `items-center` riêng (xem Modal.tsx) nên tự
       * canh theo chiều cao thật của dòng chữ, không phụ thuộc cỡ chữ nào cả.
       */
      titleBar: [
        'h-5 w-[3px] shrink-0 bg-primary-5',
        'shadow-[0_0_5px_color-mix(in_srgb,var(--color-primary-5)_32%,transparent)]',
      ],
      /**
       * Tiêu đề uppercase với tracking rộng — tone "console command".
       * `text-body-16-semibold` (trước `body-14`) — modal là bề mặt người dùng
       * NHÌN ĐẦU TIÊN khi mở, tiêu đề cần nổi hơn nhãn phụ trong thân modal.
       */
      title: 'truncate text-body-16-semibold uppercase tracking-[0.08em] text-fg-1',
      /**
       * Nút đóng — size-8 (32px) + hover scale nhẹ. Viền transparent → hiện đỏ
       * khi hover báo hành vi cancel. `relative` BẮT BUỘC: header band là absolute
       * đứng trước trong DOM, thiếu `relative` thì nút bị band phủ lên.
       */
      close: [
        'relative flex size-8 shrink-0 cursor-pointer items-center justify-center',
        'border border-transparent bg-transparent text-fg-2 outline-none',
        'transition-[color,border-color,background-color,transform] duration-150 ease-out',
        'hover:scale-105 hover:border-error/50 hover:bg-error/12 hover:text-error',
        'active:scale-95',
        'focus-visible:border-error/50 focus-visible:ring-2 focus-visible:ring-error/25',
      ],
      /**
       * Body — KHÔNG dùng `scrollbar-gutter`.
       *
       * ⚠️ ĐỪNG THÊM LẠI `[scrollbar-gutter:stable]`. Bản cũ có, và nó gây LỆCH
       * PADDING thấy rõ: `stable` (không kèm `both-edges`) chỉ chừa gutter ở CẠNH
       * PHẢI, và gutter đó nằm NGOÀI padding → cộng dồn vào inset phải:
       *
       *   px-4 + gutter  →  trái 16px · phải 16 + 10 = 26px   ← lệch 10px
       *
       * 10px là bề rộng scrollbar `thin` của Chrome (globals.css set
       * `scrollbar-width: thin` lên `*`; từ Chrome 121 việc set property chuẩn này
       * VÔ HIỆU HOÁ `::-webkit-scrollbar { width: 6px }` → gutter là 10px native
       * chứ không phải 6px như class webkit gợi ý).
       *
       * Header (`px-4`) và footer (`px-4`) KHÔNG có gutter → nội dung body bị đẩy
       * lệch 10px so với tiêu đề và cụm nút. Nhìn ra ngay ở modal rộng
       * (vd PermissionModal size 3xl).
       *
       * Đổi lại mất gì: modal có body TỰ cuộn sẽ dịch 10px lúc scrollbar xuất
       * hiện. Chấp nhận được vì hầu hết body ở hệ này không cuộn ở tầng này —
       * phần cuộn nằm ở con (Table/list có scroll riêng). Cần chống jitter cho
       * một body cụ thể thì thêm `[scrollbar-gutter:stable_both-edges]` qua
       * `bodyClassName` (both-edges để giữ CÂN ĐỐI), đừng sửa lại slot dùng chung.
       */
      body: 'relative min-h-0 flex-1 overflow-auto',
      /**
       * Footer — gradient ngược header + hairline accent ở mép trên (thay
       * `border-t` phẳng) để nối tiếp ngôn ngữ "ray" của panel. Ẩn hairline bằng
       * `before:hidden` khi consumer tắt divider.
       */
      footer: [
        'relative flex shrink-0 items-center justify-end gap-3 px-4 py-3',
        'bg-gradient-to-t from-bg-dialog-2/50 via-bg-dialog-2/15 to-transparent',
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']",
        'before:bg-gradient-to-r before:from-transparent before:via-primary-5/40 before:to-transparent',
      ],
    },
  },
  {
    // Bắt buộc: slot `title` có CẢ font token (`text-body-14-semibold`) lẫn màu
    // (`text-fg-1`). Thiếu config này, twMerge riêng của tv() coi font token là
    // màu và xoá mất cỡ chữ. Xem `cn.ts` § twMergeFontExtend.
    twMergeConfig: twMergeFontExtend,
  },
);
