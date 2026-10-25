/**
 * Header widget — token tập trung + `tv()` recipe.
 * Theo `widget-composition.md §1`: mỗi widget folder có ĐÚNG MỘT file theme,
 * JSX chỉ gọi `slots.xxx()` chứ không rải chuỗi Tailwind.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THANG KÍCH THƯỚC — 6 BẬC BỀ RỘNG (đọc trước khi sửa bất kỳ con số nào)
 * ─────────────────────────────────────────────────────────────────────────
 *   base     390–639   ĐIỆN THOẠI
 *   sm:      640–767   điện thoại ngang / tablet nhỏ
 *   md:      768–1023  TABLET DỌC      (iPad 768 · 820 · 834)
 *   lg:     1024–1279  TABLET NGANG    (iPad 1024 · 1180)
 *   xl:     1280–1535  LAPTOP 14"
 *   2xl:    1536–1799  LAPTOP 16"
 *   wide:  ≥ 1800      MÀN NGOÀI 24"+  — cỡ gốc
 *
 * `wide` khai ở `src/styles/globals.css` (`--breakpoint-wide: 112.5rem`).
 * ⛔ KHÔNG dùng `3xl` (1920px) cho "cỡ gốc": màn 24" FHD chỉ cho viewport
 *    ~1903–1910px nên media query không bao giờ khớp — header tụt về bậc
 *    compact và chữ bé một cách vô lý.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BỐ CỤC 3 CỘT + LỚP TRANG TRÍ (đọc trước khi đụng `center`/`left`/`right`)
 * ─────────────────────────────────────────────────────────────────────────
 * Chiều cao thanh CHỈ CÓ 2 MỨC: 44px · 56px (`wide`) — do
 * `HEADER_HEIGHT_CLASS.height` quy định, xem `@/shared/constants/layout`.
 *
 *   ≥ 1280px  cụm tâm RỜI khỏi luồng flex (`xl:absolute` + `inset-y-0`) và
 *             canh giữa tuyệt đối theo TÂM THANH, nên bề rộng hai cụm mép
 *             không kéo tiêu đề lệch đi.
 *   < 1280px  cụm tâm chạy TRONG LUỒNG; canh giữa do hai cụm MÉP cùng
 *             `grow basis-0` đảm nhiệm (bố cục 3 cột `1fr auto 1fr`).
 *
 * ⛔ Cụm tâm KHÔNG BAO GIỜ được `flex-1`/`grow`. Cho chính nó nở ra là nó
 *    chiếm trọn khoảng trống giữa hai mép và luôn cao trọn thanh dù nội dung
 *    page bơm vào ít — phần dôi đọc ra thành một KHỐI CHỮ NHẬT RỖNG nằm dưới
 *    cụm tiêu đề/tab. Xem chú thích ở slot `center`.
 *
 * Lớp trang trí (`hatch` sọc chéo hai đầu · `corner` ngoặc 4 góc · `rail` ray
 * đáy · `railGlow` quầng sáng tâm) đều `pointer-events-none absolute` và
 * KHÔNG mang thông tin — được phép ẩn ở màn hẹp / máy chạm.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BẬC THỨ 7 — `touch:` (máy chạm). ĐỘC LẬP với thang bề rộng ở trên.
 * ─────────────────────────────────────────────────────────────────────────
 * `touch:` = `@media (hover: none) and (pointer: coarse)`. Nó KHÔNG nói về bề
 * rộng mà về CÁCH NGƯỜI DÙNG CHẠM. Phải tách vì iPad Pro nằm ngang = 1366px =
 * trùng đúng dải `xl` của laptop 14" ⇒ không có mốc bề rộng nào tách được.
 *
 * ⛔ `touch:` CHỈ ĐƯỢC SIẾT, KHÔNG ĐƯỢC NỚI (`ipad-responsive.md §3.0`).
 *    Máy tính bảng dùng CHUNG cỡ với laptop; bấm trúng được bảo đảm bằng lớp
 *    `::after` TRONG SUỐT nới HỘP NHẬN CHẠM (§3.3), không bằng phóng to hình.
 *
 * ⛔ TUYỆT ĐỐI KHÔNG sửa giá trị ở bậc `xl` / `2xl` / `wide` với lý do "cho
 *    iPad" — đó là laptop/màn ngoài.
 */
import { tv } from 'tailwind-variants';

import { SHELL_GUTTER_X } from '@/shared/constants/layout';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * `tv()` có instance twMerge RIÊNG → phải dạy nó `text-body-14-medium` là
 * font-size chứ không phải màu. Thiếu config này, slot vừa có font token vừa
 * có `text-*` màu sẽ bị DROP mất font-size (xem `cn.ts → twMergeFontExtend`).
 */
const TV = { twMergeConfig: twMergeFontExtend } as const;

// ── Hằng chiều cao ─────────────────────────────────────────────────────────

/**
 * ⛔ MỌI control bấm được trong hàng canh giữa của thanh header PHẢI cao đúng
 * bằng nhau: logo · nút icon · khối user. Lệch vài px là cả hàng đọc ra so le.
 * 30px (laptop VÀ máy tính bảng) → 40px (`wide`).
 *
 * ⛔ KHÔNG THÊM BẬC `touch:` — nâng lên là cả dãy control đọc ra như giao diện
 *    bị phóng to, và nó ăn mất bề ngang ở đúng máy chật nhất.
 */
export const HEADER_CONTROL_HEIGHT = 'h-7.5 wide:h-10';

/**
 * Vệt mờ mép cuối cho dải chip cuộn ngang — tín hiệu "còn nội dung, vuốt tiếp".
 * TỰ ẨN khi không tràn (24px cuối là nền trống thì làm mờ cũng không thấy gì),
 * nên không cần `ResizeObserver`. CHỈ làm mờ mép CUỐI: mép đầu luôn có chip
 * nằm sát nên làm mờ ở đó là nói dối theo chiều ngược lại.
 *
 * Giữ CẢ HAI dòng `-webkit-mask-image` / `mask-image` — Safari chỉ bỏ tiền tố
 * từ bản 15.4, iPad đời cũ vẫn dưới mốc đó.
 */
export const HEADER_SCROLL_FADE_CLASS = [
  'touch:[-webkit-mask-image:linear-gradient(to_right,#000_calc(100%_-_1.5rem),transparent)]',
  'touch:[mask-image:linear-gradient(to_right,#000_calc(100%_-_1.5rem),transparent)]',
].join(' ');

// ── Token chuyển động + khung ──────────────────────────────────────────────

/** Transition đầy đủ cho surface đổi cả viền lẫn bóng. */
const FRAME_TRANSITION =
  'transition-[color,border-color,background-color,box-shadow] duration-200 ease-out';

/** Quầng sáng bên trong — token `--color-bg-primary`, KHÔNG rgba viết cứng. */
const FRAME_INNER_GLOW = 'shadow-[inset_0_0_12px_var(--color-bg-primary)]';

/**
 * Ngoặc góc NGOÀI viền nút (trên-trái + dưới-phải) → hiệu ứng "khung kép":
 * viền chính mảnh, ngoặc ôm bên ngoài. Luôn hiện mờ ở idle, sáng lên khi
 * hover/open. Góc VUÔNG tuyệt đối theo `tailwind-conventions.md`.
 *
 * ⛔ CẢ HAI ngoặc vẽ trên MỘT pseudo-element `::before` — đừng tách sang
 *    `::after`. `::after` đã dành cho lớp TRONG SUỐT nới vùng chạm
 *    (`ipad-responsive.md §3.3`); hai thứ tranh nhau một pseudo-element thì
 *    `inset-x-0 -inset-y-1.5` của vùng chạm ghi đè `right/bottom` của ngoặc
 *    (over-constrained) → ngoặc dưới-phải nhảy lên góc trên-trái và lơ lửng
 *    ngoài nút, đồng thời `pointer-events-none` của ngoặc giết luôn vùng chạm.
 *
 * 4 thanh ngoặc = 4 lớp `background` lấy `currentColor`, nên đổi tông chỉ cần
 * đổi `before:text-*`.
 */
const BRACKET_CORNERS = [
  "before:pointer-events-none before:absolute before:-inset-0.5 before:content-['']",
  'before:text-primary-5/45 before:transition-colors before:duration-200',
  // [ngang trên-trái 8×2] [dọc trên-trái 2×8] [ngang dưới-phải 8×2] [dọc dưới-phải 2×8]
  'before:[background:linear-gradient(currentColor,currentColor)_no-repeat_left_top/8px_2px,linear-gradient(currentColor,currentColor)_no-repeat_left_top/2px_8px,linear-gradient(currentColor,currentColor)_no-repeat_right_bottom/8px_2px,linear-gradient(currentColor,currentColor)_no-repeat_right_bottom/2px_8px]',
].join(' ');

/**
 * Ngoặc sáng lên khi hover.
 * ⛔ `text-*` chứ KHÔNG `border-*`: ngoặc vẽ bằng `background` lấy
 *    `currentColor`, đặt `hover:before:border-*` là sinh class chết.
 */
const BRACKET_HOVER = 'hover:before:text-primary-5';

/** Ngoặc sáng ở trạng thái mở/active (không qua `:hover`). */
const BRACKET_ON = 'before:text-primary-5';

/**
 * Nút icon CHUẨN của header — nguồn style DUY NHẤT cho mọi nút icon toàn cục
 * (ThemeToggle, action tuỳ biến do app bơm vào). Dùng chung để cả cụm đồng nhất
 * tuyệt đối về kích thước, khung, hover, focus ring.
 */
export const HEADER_ICON_BUTTON_CLASS = [
  'relative inline-flex shrink-0 items-center justify-center',
  // Vuông: cạnh PHẢI luôn khớp `HEADER_CONTROL_HEIGHT` (30 · 40) — thêm bậc ở
  // bên này mà quên bên kia là cả dãy vế phải so le thấy rõ.
  'size-7.5 wide:size-10 cursor-pointer outline-none',
  // ⛔ Vùng chạm nới bằng lớp `::after` TRONG SUỐT — KHÔNG phóng to nút.
  //    CHỈ nới DỌC: dãy nút cách nhau 4px, nới ngang là hai vùng chạm chồng
  //    nhau và cú bấm rơi vào phần tử nằm trên trong thứ tự vẽ.
  "touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-1.5 touch:after:content-['']",
  // `!` BẮT BUỘC: `SystemIcon` set width/height bằng INLINE STYLE nên class
  // thường thua specificity → không có `!` thì icon không thu nhỏ theo bậc.
  '[&>svg]:size-4! wide:[&>svg]:size-5!',
  'border border-primary-5/25 bg-transparent text-fg-on-nav',
  FRAME_TRANSITION,
  BRACKET_CORNERS,
  BRACKET_HOVER,
  'hover:border-primary-5/60 hover:bg-nav-hover-bg hover:text-primary-5',
  // ⚠️ Viết LITERAL, KHÔNG nội suy `hover:${FRAME_INNER_GLOW}`: scanner của
  //    Tailwind đọc file dạng văn bản thuần nên không resolve được template.
  'hover:shadow-[inset_0_0_12px_var(--color-bg-primary)]',
  'active:scale-95',
  'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
].join(' ');

/**
 * Áp THÊM khi nút icon đang ở trạng thái mở/active.
 *
 * ⛔ HẬU TỐ `!` LÀ BẮT BUỘC Ở BA UTILITY ĐẦU — đừng gỡ để "cho sạch".
 *
 * Hằng này được NỐI vào sau `HEADER_ICON_BUTTON_CLASS`, mà trong đó có
 * `hover:border-primary-5/60` · `hover:bg-nav-hover-bg` · `hover:text-primary-5`.
 * Hai bên khác NHÓM MODIFIER (`hover:` vs không) nên tailwind-merge KHÔNG loại
 * bên nào, và `:hover` thắng về độ đặc hiệu ⇒ rê chuột lên nút ĐANG MỞ là nó
 * đổi về nền hover và đọc ra như đã đóng — đúng lỗi "khung viền bám nhầm nút"
 * mà chip của page vừa phải sửa.
 *
 * `!` cho trạng thái mở thắng về CẤU TRÚC (importance thắng mọi độ đặc hiệu),
 * không phải bằng cách vặn alpha cho khác nhau — cách đó sẽ vỡ lại ngay lần
 * ai đó chỉnh màu hover.
 */
export const HEADER_ICON_BUTTON_ACTIVE = [
  'border-primary-5/60! bg-nav-active-bg! text-primary-5!',
  FRAME_INNER_GLOW,
  BRACKET_ON,
].join(' ');

// ── Vỏ thanh header ────────────────────────────────────────────────────────
export const headerStyles = tv(
  {
    slots: {
      root: [
        'relative z-30 flex shrink-0 items-center justify-between',
        // Khe giữa các cụm là chuyện RIÊNG của thanh (chật thì siết) — nhưng LỀ
        // NGANG phải bằng đúng lề của `<main>`, nếu không logo và khối user lệch
        // khỏi mép nội dung 8–10px. Xem `SHELL_GUTTER_X`.
        'gap-1 md:gap-1.5 wide:gap-4',
        SHELL_GUTTER_X,
        'bg-gradient-to-b from-header-from/95 to-header-to/98 backdrop-blur-md',
        'text-fg-on-nav',
        /**
         * ⛔ TV MODE: trả `--ui-scale` về 1 cho RIÊNG thanh header. Đừng gỡ.
         * Thanh có chiều cao CỐ ĐỊNH và cụm tâm bị kẹp giữa hai mép; chữ nở
         * 10–30% trong khi trần px đứng yên là cụm tâm ĐÈ LÊN chip hai bên.
         * Header là chrome điều hướng, không phải dữ liệu để đọc từ 3m — vùng
         * nội dung bên dưới VẪN nhận đủ mức phóng, đó mới là chỗ TV phục vụ.
         */
        'tv:[--ui-scale:1]',
      ],
      /**
       * Sọc chéo trang trí hai đầu thanh — mask mờ dần vào giữa.
       *
       * ⛔ ẨN dưới `md` VÀ trên MỌI máy chạm. 96–176px sọc rơi đúng hai đầu
       *    thanh — chỗ đông nhất (logo bên trái, dãy icon + khối user bên
       *    phải), mà trên máy chạm hai cụm đó còn phình thêm vì vùng chạm nới
       *    ra. Để lại thì chữ và icon đọc trên nền kẻ sọc. Đây là chi tiết
       *    TRANG TRÍ thuần (`pointer-events-none`) nên ẩn KHÔNG mất chức năng
       *    nào — đúng ngoại lệ `ipad-responsive.md §4` cho phép.
       */
      hatch: [
        'pointer-events-none absolute inset-y-0 opacity-25',
        'hidden w-16 md:block lg:w-24 wide:w-44 touch:hidden',
        'bg-[repeating-linear-gradient(115deg,var(--color-primary-5)_0px,var(--color-primary-5)_1px,transparent_1px,transparent_9px)]',
      ],
      /** Ngoặc góc lớn của CẢ THANH (4 góc) — hướng do variant `at` quyết định. */
      corner: 'pointer-events-none absolute size-2.5 border-primary-5/45 md:size-3.5',
      /** Ray gradient chạy hết đáy — sáng nhất ở tâm. */
      rail: [
        'pointer-events-none absolute inset-x-0 bottom-0 h-px',
        'bg-gradient-to-r from-transparent via-primary-5 to-transparent',
      ],
      /**
       * Quầng sáng mềm dưới tâm ray — điểm nhấn tâm thanh.
       * Quầng PHẢI hẹp hơn hẳn bề ngang thanh mới đọc ra là "điểm nhấn"; rộng
       * bằng thanh thì nó chỉ là một vệt sáng chạy hết đáy.
       */
      railGlow: [
        'pointer-events-none absolute bottom-0 left-1/2 h-px -translate-x-1/2',
        'w-40 md:w-56 lg:w-72',
        'bg-primary-5 opacity-60 blur-[2px]',
      ],
      /**
       * Cụm trái. `self-stretch` BẮT BUỘC — `pageSlot` bên trong cần cha cao
       * trọn thanh thì chip mới `self-end` xuống sát ray đáy được.
       *
       * ⛔ `min-w-fit` ở `max-lg:`/`touch:` — chống logo trườn lên tiêu đề. Ô
       *    này có `min-w-0` (bỏ sàn tự động) nhưng con bên trong `shrink-0`
       *    nên phần dôi TRÀN RA và vẽ đè lên slot tiêu đề. `min-w-min` KHÔNG
       *    đủ vì nhãn `truncate` đóng góp min-content bằng 0.
       *    Cần CẢ HAI cổng (`ipad-responsive.md §8.1`): `max-lg:` lo iPad dọc
       *    CẮM CHUỘT (`pointer: fine` ⇒ `touch:` không khớp), `touch:` lo iPad
       *    NẰM NGANG (1180 · 1366px) mà `max-lg:` không với tới.
       */
      /**
       * ⛔ `max-xl:grow max-xl:basis-0` — MỘT NỬA của cơ chế CANH GIỮA THẬT,
       *    phải đi CẶP với đúng hai class đó ở slot `right`. Xem giải thích đầy
       *    đủ ở variant `layout.floating`. Sửa một bên mà quên bên kia là tiêu
       *    đề lệch hẳn sang một phía.
       *
       * ⛔ KHÔNG đặt `shrink-0` ở đây. Cụm này phải co được thì `pageSlot` bên
       *    trong mới CUỘN NGANG khi chật (`ipad-responsive.md §4`); khoá cứng
       *    là nó ăn hết chỗ và đẩy cụm tâm lệch đi. Sàn chống-sập đã có ở hai
       *    cổng `max-lg:` / `touch:` ngay dưới.
       */
      left: [
        'flex min-w-0 items-center gap-1 self-stretch md:gap-1.5 wide:gap-2',
        'max-xl:grow max-xl:basis-0 touch:grow touch:basis-0',
        'max-lg:min-w-fit touch:min-w-fit',
      ],
      /**
       * Cụm phải — đối xứng với `left`, nhưng GIỮ `shrink-0`: đây là cụm
       * utility TOÀN CỤC, không được co lại nhường chỗ cho tiêu đề (tiêu đề đã
       * có `truncate` để tự nhường). `justify-end` giữ dãy icon neo về mép khi
       * ô nở ra theo `grow`.
       *
       * ⛔ TUYỆT ĐỐI KHÔNG thêm `min-w-0` vào ô NÀY (cụm trái thì cần, xem
       *    trên). `min-w-0` bỏ SÀN `min-width: auto`, mà ô này lại `basis-0` +
       *    `grow` ở dưới `xl`: khi phần dôi chia cho mỗi mép ít hơn bề rộng
       *    dãy icon, hộp tụt xuống nhỏ hơn nội dung và vì `justify-end` phần
       *    dôi TRÀN NGƯỢC sang trái, đè lên cụm tâm. Cụm trái không dính lỗi
       *    này vì phần dôi của nó rơi vào `pageSlot` — một vùng CUỘN.
       */
      right: [
        'flex shrink-0 items-center justify-end gap-1 self-stretch md:gap-1.5 wide:gap-2',
        'max-xl:grow max-xl:basis-0 touch:grow touch:basis-0',
        'max-lg:min-w-fit touch:min-w-fit',
      ],
      /**
       * Slot tiêu đề module — đích portal của `<PageHeader>`.
       *
       * ⛔ SLOT NÀY KHÔNG ĐƯỢC NỞ RA (không `flex-1`, không `grow`) và KHÔNG
       *    ĐƯỢC cao hơn thanh. Bản trước để `flex-1 self-stretch`: ô tâm ngốn
       *    trọn khoảng trống giữa hai cụm mép và luôn cao trọn thanh dù nội
       *    dung page bơm vào chỉ chiếm một phần — phần dôi đó là MẢNG TRỐNG
       *    đọc ra như một khối chữ nhật rỗng tụt xuống dưới cụm tiêu đề/tab.
       *    Hình dạng + canh giữa nay do variant `layout` lo (xem dưới).
       *
       * `:empty` → ẩn hẳn, trang không đăng ký gì thì thanh y hệt bản trống.
       */
      center: ['flex min-w-0 items-center empty:hidden', '[&>*]:pointer-events-auto'],
      /**
       * Slot chip của page ở hai mép. Chật thì CUỘN — KHÔNG ẩn chức năng
       * (`ipad-responsive.md §4`). `overscroll-x-contain` là BẮT BUỘC: thiếu
       * nó, vuốt hết dải trên Safari iOS bị hiểu thành "lùi lại trang trước"
       * và người dùng tưởng app tự thoát (§4.1).
       */
      pageSlot: [
        'flex min-w-0 shrink items-center gap-1 self-stretch empty:hidden',
        'overflow-x-auto overscroll-x-contain scrollbar-hidden',
        HEADER_SCROLL_FADE_CLASS,
        /**
         * ⛔ Từ `xl` trở lên TRẢ VỀ `shrink-0` + `overflow-visible`.
         *    Laptop/màn ngoài luôn đủ chỗ, mà `overflow` sẽ CẮT quầng
         *    `drop-shadow` của chip đang bật.
         * ⛔ Máy chạm thì GIỮ co + cuộn ở MỌI bề ngang: iPad 13" nằm ngang =
         *    1366px cũng rơi vào `xl`, `xl:shrink-0` ở đó khiến dải chip không
         *    co được nữa và hai cụm mép chồng lên cụm tâm.
         */
        'xl:shrink-0 xl:overflow-visible',
        'touch:shrink touch:overflow-x-auto',
        '[&>[data-header-chip]]:self-end',
      ],
      /**
       * Vạch ngăn mảnh giữa các nhóm nút. `shrink-0` — thiếu là nó biến mất.
       * Ẩn dưới `sm`: trên điện thoại cụm phải chỉ còn vài nút icon + avatar,
       * vạch không tách được gì mà vẫn ăn thêm hai lần `gap`.
       */
      tick: 'hidden h-3 w-px shrink-0 self-center bg-nav-divider sm:block wide:h-4',
    },
    variants: {
      /** Vị trí của `hatch` / `corner` trên thanh. */
      at: {
        tl: {
          hatch: 'left-0 [mask-image:linear-gradient(90deg,#000,transparent)]',
          corner: 'left-0 top-0 border-l-2 border-t-2',
        },
        tr: {
          hatch: 'right-0 [mask-image:linear-gradient(270deg,#000,transparent)]',
          corner: 'right-0 top-0 border-r-2 border-t-2',
        },
        bl: { corner: 'bottom-0 left-0 border-b-2 border-l-2' },
        br: { corner: 'bottom-0 right-0 border-b-2 border-r-2' },
      },
      /**
       * Kiểu bố cục cụm tâm — người dùng chọn, xem `header-layout.store.ts`.
       *
       * ⚠️ Node slot tiêu đề LUÔN là con trực tiếp của `<header>` và KHÔNG bao
       *    giờ đổi vị trí trong cây, chỉ đổi class. Chuyển node giữa hai nhánh
       *    JSX là ref callback detach/attach lệch thứ tự và xoá nhầm node mới
       *    → tiêu đề biến mất.
       */
      layout: {
        /**
         * Canh giữa TUYỆT ĐỐI thanh — bề rộng hai cụm mép không làm lệch tâm.
         *
         * ⛔ DƯỚI 1280px KHÔNG canh giữa tuyệt đối. `absolute` khiến cụm tâm
         *    không biết hai cụm mép rộng bao nhiêu, nó chỉ tự chặn bằng
         *    `max-w`; ở màn hẹp hai đầu cụm tâm trườn lên logo và dãy icon —
         *    không con số `max-w` nào cứu được vì hai cụm kia co giãn theo nội
         *    dung trang. Bậc đó chạy TRONG LUỒNG flex, phần dôi thì CUỘN NGANG.
         *
         * ⛔ CANH GIỮA THẬT = BỐ CỤC 3 CỘT, KHÔNG phải cho slot này nở ra.
         *    Cho chính nó `grow` rồi `justify-center` là canh giữa PHẦN DÔI,
         *    mà cụm trái và cụm phải rộng khác nhau nên tâm phần dôi KHÔNG
         *    phải tâm thanh — lệch đúng nửa hiệu hai cụm. Cách đúng: hai cụm
         *    MÉP cùng `grow basis-0` (xem `left`/`right`), cụm tâm giữ bề rộng
         *    tự nhiên ở giữa.
         *
         * ⛔ Trần `max-w` phải NHỎ HƠN khoảng trống thật giữa hai cụm mép:
         *    canh giữa tuyệt đối nên vượt trần là ĐÈ LÊN cụm mép chứ không đẩy.
         *    Đổi cỡ chữ tiêu đề / thêm chip vào page thì phải tính lại.
         */
        floating: {
          center: [
            'relative min-w-0 self-stretch justify-center',
            'overflow-x-auto overscroll-x-contain scrollbar-hidden',
            HEADER_SCROLL_FADE_CLASS,
            // ≥ 1280px: canh giữa tuyệt đối. `inset-y-0` ghim chiều cao ĐÚNG
            // bằng thanh nên cụm tâm không bao giờ cao hơn header.
            'xl:pointer-events-none xl:absolute xl:inset-y-0 xl:left-1/2 xl:z-10',
            'xl:-translate-x-1/2 xl:justify-center',
            /**
             * ⛔ `xl:overflow-visible` PHẢI CÓ. Cụm này `absolute` +
             *    `pointer-events-none` nên KHÔNG làm được vùng cuộn: không có
             *    thanh cuộn để thấy, không có gì để kéo, mà `overflow-x-auto`
             *    lại kéo theo `overflow-y` khác `visible` → chip `self-end`
             *    chạm mép dưới bị CẮT. Tràn thì đè (xấu nhưng còn bấm được)
             *    vẫn hơn tràn thì mất hẳn.
             */
            'xl:overflow-visible',
            /**
             * ⛔ `xl:w-full` ĐI CẶP với `max-w-*` ngay dưới — thiếu nó thì cả
             *    hai dòng `max-w-*` là class chết.
             *
             *    Cụm này `absolute`, mà hộp absolute mặc định CO THEO NỘI DUNG
             *    (shrink-to-fit). Bề rộng khi đó luôn nhỏ hơn trần nên `max-w-*`
             *    không bao giờ kẹp vào đâu cả.
             *
             *    Hậu quả ĐO ĐƯỢC (1920px, trang có 3 tab tách 2/1): hai ô nav
             *    của `<PageHeader>` là `flex-1 basis-0` nên LUÔN RỘNG BẰNG NHAU;
             *    với bề rộng co theo nội dung, cụm chỉ có 609px ⇒ mỗi ô được
             *    146px. Ô trái chứa dải chip 180px (`shrink-0`, không co) nên
             *    dải TRÀN 34px ra ngoài ô và chui xuống dưới cánh `///` của bảng
             *    tên — đè đúng 14px lên chữ "Tiến độ".
             *
             *    `w-full` = 100% bề ngang thanh, rồi `max-w-*` kẹp lại → bề rộng
             *    XÁC ĐỊNH. Hai ô nav đủ chỗ cho dải chip, khe hai bên bảng tên
             *    cân nhau, và bảng tên vẫn đúng tâm màn.
             */
            'xl:w-full',
            'xl:max-w-[min(48vw,640px)] 2xl:max-w-[min(52vw,700px)]',
            'wide:max-w-[min(66vw,1000px)]',
            /**
             * ⛔ MÁY CHẠM: HUỶ TOÀN BỘ khối `xl:` trên, quay về trong luồng.
             *    iPad Pro/Air 13" nằm ngang = 1366px, rơi thẳng vào `xl` của
             *    laptop 14"; ở đó cụm tâm canh giữa tuyệt đối + `overflow-
             *    visible`, mà vùng chạm đã nới làm hai cụm mép phình ~90px nên
             *    phần dôi TRƯỜN LÊN cụm mép. Không chữa được bằng cách nới
             *    `xl:max-w` (đụng đúng laptop đang chạy tốt) — `touch:` là mốc
             *    duy nhất tách được iPad-1366 khỏi laptop-1366.
             */
            'touch:pointer-events-auto touch:relative touch:inset-y-auto touch:left-auto',
            'touch:z-auto touch:translate-x-0 touch:justify-center touch:overflow-x-auto',
          ],
        },
        /**
         * Tiêu đề nằm SÁT cụm trái, `mr-auto` đẩy cụm phải về cuối thanh —
         * kiểu gọn nhất, hợp màn hẹp. `self-stretch` BẮT BUỘC: thiếu nó thì
         * `h-full` của bảng tên bên trong quy chiếu vào một parent cao `auto`
         * (do `items-center` của header) và tụt về chiều cao nội dung.
         */
        inline: {
          center: [
            'relative mr-auto min-w-0 self-stretch justify-start',
            'overflow-x-auto overscroll-x-contain scrollbar-hidden xl:overflow-visible',
            HEADER_SCROLL_FADE_CLASS,
            // Máy chạm giữ cuộn ở MỌI bề rộng — cùng lý do với `pageSlot`.
            'touch:overflow-x-auto',
          ],
        },
      },
    },
    defaultVariants: { layout: 'floating' },
  },
  TV,
);

// ── Logo ───────────────────────────────────────────────────────────────────
export const logoStyles = tv(
  {
    slots: {
      root: [
        'group inline-flex shrink-0 select-none items-center outline-none',
        HEADER_CONTROL_HEIGHT,
        'gap-1.5 px-1.5 md:gap-2 md:px-2 wide:gap-2.5 wide:px-3',
        'transition-[background-color,box-shadow] duration-200 ease-out',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      ],
      mark: 'flex shrink-0 items-center text-primary-5 [&>svg]:size-4! md:[&>svg]:size-5! wide:[&>svg]:size-6!',
      /**
       * Wordmark — ẩn dưới `md` để nhường chỗ cho chip của page.
       *
       * ⛔ KHÔNG DÙNG `bg-clip-text` + `text-transparent` — đã bỏ, đừng đưa
       *    lại. `background-clip: text` buộc trình duyệt bỏ subpixel
       *    antialiasing (chuyển sang grayscale AA) nên glyph mảnh đi và viền
       *    chữ nhoè — thấy rõ nhất ở bậc 12–14px, tức là bậc mà wordmark nằm
       *    suốt trên laptop. Đây đúng thứ `PageHeaderTitle` đã cấm cho bảng
       *    tên module; wordmark bị sót lại nên nó nhoè hơn chính tiêu đề đứng
       *    cạnh. Fill ĐẶC bằng token `fg-on-nav` giữ nguyên độ nét và tương
       *    phản ở cả hai theme (token tự flip).
       *
       * `-bold` chứ không `-medium`: đây là LOGOTYPE, độ nổi mua bằng tương
       * phản + nét chữ, KHÔNG mua bằng kích thước (chữ to hơn là cụm trái
       * phình ra và đè lên cụm tâm canh giữa tuyệt đối).
       */
      text: [
        'text-fg-on-nav',
        'text-caption-12-bold tracking-tight md:text-body-14-bold wide:text-body-16-bold',
        'max-md:hidden',
      ],
    },
    variants: {
      /** Có điều hướng → thêm phản hồi hover; `<span>` tĩnh thì không. */
      interactive: {
        true: {
          root: 'cursor-pointer hover:bg-nav-hover-bg hover:shadow-[inset_0_0_12px_var(--color-bg-primary)]',
        },
      },
    },
    defaultVariants: { interactive: false },
  },
  TV,
);

// ── Khối user ở mép phải ───────────────────────────────────────────────────
export const userMenuStyles = tv(
  {
    slots: {
      trigger: [
        'group relative inline-flex shrink-0 cursor-pointer items-center outline-none',
        HEADER_CONTROL_HEIGHT,
        'gap-1.5 px-1 md:px-1.5 wide:gap-2 wide:px-2',
        'border border-primary-5/25 bg-transparent text-fg-on-nav',
        FRAME_TRANSITION,
        /**
         * ⛔ HOVER PHẢI GATE BẰNG `not-data-[state=open]:` — đừng bỏ tiền tố đó.
         *    `hover:border-primary-5/60` và `data-[state=open]:border-primary-5/60`
         *    khác nhóm modifier nên tailwind-merge KHÔNG loại bên nào, mà
         *    `:hover` thắng độ đặc hiệu ⇒ rê chuột lên khối user ĐANG MỞ là
         *    viền/nền tụt về mức hover, đọc ra như menu đã đóng. Gate lại thì
         *    trạng thái mở thắng về CẤU TRÚC: hover chỉ tồn tại khi đang đóng.
         */
        'not-data-[state=open]:hover:border-primary-5/60',
        'not-data-[state=open]:hover:bg-nav-hover-bg',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
        "touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-1.5 touch:after:content-['']",
        // Trạng thái mở đọc từ `data-state` do Radix Trigger (`asChild`) gắn
        // vào chính phần tử này — KHÔNG cần nâng state lên React.
        'data-[state=open]:border-primary-5/60 data-[state=open]:bg-nav-active-bg',
      ],
      /** Vạch accent trái — chi tiết TRANG TRÍ, ẩn ở màn hẹp (không mất chức năng). */
      accentBar: 'pointer-events-none absolute inset-y-1 left-0 w-px bg-primary-5/60 max-md:hidden',
      avatarWrap: 'flex shrink-0 items-center',
      /** Tên + vai trò — ẩn dưới `lg` (còn avatar), đúng thang rút gọn đã chốt. */
      identity: 'flex min-w-0 flex-col items-start leading-none max-lg:hidden',
      name: 'max-w-[7rem] truncate text-caption-12-medium xl:max-w-[9rem] wide:text-body-14-medium',
      role: 'max-w-[7rem] truncate text-caption-10 text-fg-on-nav-muted xl:max-w-[9rem]',
      caret: [
        'shrink-0 text-fg-on-nav-muted transition-transform duration-200 max-md:hidden',
        // Xoay theo `data-state` của trigger (phần tử cha) — cùng lý do ở `trigger`.
        'group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary-5',
      ],
      /** Thẻ thông tin user ở đầu panel menu. */
      panelHeader: 'flex items-center gap-2.5',
      panelIdentity: 'flex min-w-0 flex-1 flex-col',
    },
  },
  TV,
);
