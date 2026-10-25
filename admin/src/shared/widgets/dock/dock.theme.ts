/**
 * Dock widget — token tập trung + `tv()` recipe (`widget-composition.md §1`).
 *
 * Dock là thanh launcher kiểu macOS neo ĐÁY màn hình. Hai nhóm quy tắc khác
 * nhau, đừng trộn (`ipad-responsive.md §8.1`):
 *
 *   BỀ RỘNG (`max-xl:`) — "hết chỗ". Còn hết chỗ y hệt khi cắm chuột.
 *   NGÓN TAY (`touch:`) — "khó bấm". Hết khó khi cắm chuột.
 *
 * Câu hỏi để chọn cổng: "Cắm chuột vào máy này thì vấn đề còn không?"
 *
 * Sửa MỘT chỗ ở đây → `Dock` / `DockItem` / `DockSettingsButton` đồng bộ. Đừng
 * rải chuỗi Tailwind dài trong JSX.
 *
 * ⚠️ Tailwind v4 quét file như VĂN BẢN THUẦN: mọi class phải là chuỗi LITERAL,
 *    không nội suy `${...}`, nếu không rule sẽ không được sinh ra.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

const TV = { twMergeConfig: twMergeFontExtend } as const;

/**
 * Khoảng hở đáy, ĐÃ CỘNG VÙNG AN TOÀN.
 *
 * `--safe-b` = `env(safe-area-inset-bottom)` — **0px** trên PC/laptop và trong
 * tab trình duyệt thường, nên `calc(16px + 0px)` cho ra đúng 16px như cũ. Chỉ
 * khác 0 khi app chạy toàn màn trên máy có vạch Home (~20px).
 *
 * ⛔ KHÔNG neo đáy mà quên `--safe-b`: hàng icon nằm chồng lên vạch Home, vuốt
 *    lên để bấm icon hoá ra là cử chỉ THOÁT APP.
 */
export const DOCK_BOTTOM_CLASS = 'bottom-[calc(1rem+var(--safe-b,0px))]';

/**
 * Khoảng hở đáy khi THU GỌN — tay nắm nằm sát mép hơn để trả lại chiều cao cho
 * nội dung. Vẫn cộng `--safe-b` vì cùng lý do ở trên.
 */
export const DOCK_BOTTOM_COLLAPSED_CLASS = 'bottom-[calc(0.25rem+var(--safe-b,0px))]';

/**
/**
 * Vừa màn hẹp: giới hạn bề ngang + CHO CUỘN NGANG thay vì cắt bớt icon
 * (`ipad-responsive.md §4` — chật thì cuộn, cấm ẩn chức năng).
 *
 * ⛔ `overscroll-x-contain` BẮT BUỘC: thiếu nó, vuốt hết dải trên Safari iOS bị
 *    hiểu thành "lùi lại trang trước" — người dùng tưởng app tự thoát.
 * ⚠️ `scrollbar-hidden` KHÔNG nhận tiền tố biến thể (nó là selector thường
 *    trong `@layer utilities`, không phải `@utility`). Viết
 *    `max-xl:scrollbar-hidden` sẽ KHÔNG sinh ra rule nào — lỗi IM LẶNG.
 */
export const DOCK_NARROW_FIT_CLASS = [
  'max-xl:max-w-[calc(100vw-1rem)] max-xl:overflow-x-auto max-xl:overscroll-x-contain',
  'scrollbar-hidden',
].join(' ');

/**
 * ⛔ CLASS MÓC cho hiệu ứng phóng lân cận. Rule thật nằm ở `dock-magnify.css`
 *    vì sibling-combinator (`:hover +`, `:has(+ :hover)`) KHÔNG biểu diễn được
 *    bằng utility class trên từng element.
 *
 * `DOCK_MAGNIFY_CONTAINER_CLASS` gắn lên `<nav>`, `DOCK_MAGNIFY_ITEM_CLASS` gắn
 * lên từng ô tham gia hiệu ứng. ĐỪNG gắn class item lên vạch ngăn — nó làm ĐỨT
 * chuỗi anh em mà `:hover + …` dựa vào.
 */
export const DOCK_MAGNIFY_CONTAINER_CLASS = 'dock-magnify';
export const DOCK_MAGNIFY_ITEM_CLASS = 'dock-magnify-item';

/**
 * Class móc cho hiệu ứng BAY VÀO khi thanh vừa trồi lên (chế độ `autohide`).
 *
 * Gắn lên phần tử BỌC glyph, KHÔNG gắn lên chính ô bấm: ô bấm đang mang
 * transform của hiệu ứng phóng lân cận, hai transform trên cùng một phần tử sẽ
 * đè nhau và icon giật. Hai lớp khác nhau thì trình duyệt tự ghép hình.
 *
 * Rule chỉ chạy khi `<nav>` mang `data-dock-state="opening"` — mở xong là icon
 * đứng yên tuyệt đối, bấm không trượt.
 */
export const DOCK_ENTER_CLASS = 'dock-icon-enter';

/**
 * Vệt sáng gợi ý ở giữa mép dưới khi thanh đang tự ẩn — cho người dùng biết
 * "có cái gì đó ở đây". Rule ở `dock-magnify.css §2`.
 *
 * ⛔ Nó `pointer-events: none` VĨNH VIỄN: chỉ là hình vẽ, không bắt sự kiện.
 *    Việc phát hiện con trỏ do `Dock.tsx` lo bằng toạ độ chuột, nhờ vậy vệt
 *    sáng không chắn mất nút nào nằm dưới nó.
 */
export const DOCK_HINT_CLASS = 'dock-hint';

/**
 * Vùng kích hoạt ở giữa mép dưới màn hình, tính bằng px.
 *
 * ⚠️ PHẢI khớp với kích thước vẽ của `.dock-hint` trong `dock-magnify.css` —
 *    lệch nhau thì người dùng rê đúng vào vệt sáng mà thanh không lên (hoặc
 *    thanh lên khi con trỏ còn ở chỗ chẳng có gì).
 */
export const DOCK_TRIGGER_ZONE = {
  /** Chiều cao dải tính từ mép dưới. */
  height: 22,
  /** Nửa bề rộng dải tính từ tâm màn hình. */
  halfWidth: 60,
} as const;

/** Đường cong chuyển động kiểu macOS (easeOutQuint) — vào nhanh, dừng êm. */
export const DOCK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Mốc thời gian (ms) của các chuyển động.
 *
 * ⚠️ `shellOpen` / `iconEnter` / `iconStagger` phải KHỚP với giá trị trong
 *    `dock-magnify.css`. Lệch nhau thì máy trạng thái ở JS chuyển sang pha
 *    "xong" trong khi CSS còn đang chạy — icon nhảy giật một nhịp ở cuối.
 */
export const DOCK_DURATION = {
  /** Trượt lên/xuống, đổi đệm, mờ dần. */
  reveal: 300,
  /** Chờ xác nhận ý định trước khi bung — chống bung nhầm khi lướt chuột qua. */
  armDelay: 80,
  /** Thanh trồi lên xong. */
  shellOpen: 300,
  /** Lệch pha giữa hai icon liền kề, tính từ tâm ra hai bên. */
  iconStagger: 25,
  /** Một icon bay vào. */
  iconEnter: 300,
  /** Giữ thanh thêm một nhịp sau khi con trỏ rời — chống nhấp nháy. */
  closeDelay: 500,
} as const;

export const dockStyles = tv(
  {
    slots: {
      /**
       * Vỏ thanh Dock.
       * ⛔ `bottom` PHẢI qua `DOCK_BOTTOM_CLASS` (đã cộng `--safe-b`).
       */
      root: [
        'fixed left-1/2 z-40 -translate-x-1/2',
        'flex items-end gap-2',
        DOCK_BOTTOM_CLASS,
        'border border-border-1 bg-bg-2',
        'shadow-[0_8px_32px_var(--color-popup-shadow)]',
        'px-3 py-2',
        DOCK_NARROW_FIT_CLASS,
        // Trượt / mờ / đổi đệm / đổi độ cao neo đều đi qua MỘT transition.
        // Giá trị khớp `DOCK_DURATION.reveal` + `DOCK_EASE`.
        'transition-[translate,opacity,padding,bottom] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        // ⛔ SIẾT ở máy chạm, KHÔNG nới (`ipad-responsive.md §3.0`): Dock nằm
        //    ở đúng thiết bị có ít chiều cao dùng được nhất.
        'touch:gap-1 touch:px-2',
      ],
      /**
       * Ô bấm của một mục.
       *
       * ⛔ Ở ĐÂY KHÔNG CÓ hover phóng/nâng — nó nằm trong biến thể `softHover`
       *    và CHỈ bật khi người dùng đã TẮT phóng lân cận. Lý do: Tailwind v4
       *    đặt `scale-*`/`translate-*` vào hai thuộc tính CSS RIÊNG (`scale`,
       *    `translate`), còn `dock-magnify.css` đặt `transform`. Trình duyệt áp
       *    dụng CẢ BA — hai hiệu ứng cộng dồn thành cú nảy gấp rưỡi mức thiết
       *    kế, và vì không có xung đột nào để cảnh báo nên đây là lỗi CÂM.
       */
      item: [
        'group relative flex size-11 shrink-0 items-center justify-center outline-none',
        'border border-transparent bg-transparent',
        'origin-bottom transition duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1)]',
        'hover:bg-nav-hover-bg',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
        // Máy chạm: 44 → 40px. SIẾT, và cổng là `touch:` chứ KHÔNG phải
        // `max-xl:` — cửa sổ desktop thu nhỏ không được đổi cỡ nút.
        'touch:size-10',
      ],
      /**
       * Bọc glyph.
       * ⛔ TÁCH RIÊNG khỏi `item`: bộ chọn `[&>svg]` chỉ khớp CON TRỰC TIẾP, mà
       *    giữa `<button>` và `<svg>` còn `<span>` này chen vào.
       * ⚠️ Hậu tố `!` BẮT BUỘC — `SystemIcon` đặt width/height bằng INLINE STYLE.
       */
      glyph: [
        'flex items-center justify-center text-fg-3 transition-colors duration-200',
        '[&>svg]:size-5.5! touch:[&>svg]:size-5!',
        'group-hover:text-fg-1',
      ],
      /**
       * Chấm số việc chờ ở góc trên phải ô. Nằm TRONG hộp của ô (`right-0 top-0`, không âm) vì
       * `root` cuộn ngang ở màn hẹp (`overflow-x-auto` kéo theo `overflow-y`) — chấm lồi ra ngoài
       * sẽ bị cắt. `pointer-events-none`: chấm chỉ là hình, bấm xuyên xuống `<Link>`.
       */
      badge: 'pointer-events-none absolute right-0 top-0',
      /** Chấm sáng dưới mục đang mở. */
      indicator: [
        'pointer-events-none absolute -bottom-1.5 left-1/2 h-0.5 w-3.5 -translate-x-1/2',
        'rounded-full bg-current shadow-[0_0_6px_currentColor]',
      ],
      /** Vạch ngăn giữa hai nhóm. `shrink-0` — thiếu là nó biến mất khi cuộn. */
      divider: 'mx-1 h-7 w-px shrink-0 self-center bg-nav-divider touch:mx-0.5',
      /** Tooltip tên mục — nền popup, không phải nền trang. */
      tooltip: [
        'px-2.5 py-1.5',
        'border border-popup-border bg-bg-popup backdrop-blur-md',
        'text-caption-12-medium text-fg-on-popup',
        'shadow-[0_4px_16px_var(--color-popup-shadow)]',
      ],
      /**
       * Tay nắm ba chấm ở trạng thái THU GỌN.
       *
       * Là `<button>` thật chứ không phải `<div>`: nó phải bấm được bằng phím
       * Enter/Space và phải nằm trong luồng Tab, nếu không thì bàn phím không
       * có đường nào bung thanh ra.
       */
      handle: [
        'flex shrink-0 items-center gap-1 px-1.5 py-0.5 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      ],
      /** Một chấm trong tay nắm. */
      handleDot: 'size-1 rounded-full bg-fg-4',
    },
    variants: {
      active: {
        true: {
          item: 'border-primary-5/60 bg-nav-active-bg',
          glyph: 'text-primary-5',
          indicator: 'text-primary-5',
        },
      },
      /**
       * Hover MỀM — chỉ ô đang rê nở nhẹ và nhô lên, không lan sang hàng xóm.
       *
       * Dùng khi người dùng TẮT phóng lân cận: tắt hiệu ứng không có nghĩa là
       * ô bấm đứng im như đá, vẫn phải có phản hồi để biết con trỏ đang ở đâu.
       * Bật cùng lúc với `dock-magnify.css` thì hai hiệu ứng cộng dồn — xem
       * chú thích ở slot `item`.
       *
       * `hover:` của Tailwind v4 tự bọc trong `@media (hover: hover)` nên KHÔNG
       * dính "sticky hover" trên iPad.
       */
      softHover: {
        true: { item: 'hover:-translate-y-0.5 hover:scale-[1.12]' },
      },
      /** Thu gọn: đệm nhỏ lại và thanh tụt sát đáy hơn. */
      collapsed: {
        true: { root: ['px-2 py-0.5 touch:px-1.5', DOCK_BOTTOM_COLLAPSED_CLASS] },
      },
      /**
       * Đang khuất (tự ẩn / ẩn hẳn).
       *
       * ⛔ `pointer-events-none` BẮT BUỘC: thanh vẫn nằm trong DOM ở đúng chỗ
       *    cũ, thiếu cờ này là nó chắn mọi cú bấm vào một dải rộng ngang màn
       *    hình ở đáy trang — lỗi câm, không ai nghĩ tới thanh đang trong suốt.
       */
      concealed: {
        true: { root: 'pointer-events-none translate-y-[160%] opacity-0' },
      },
    },
    defaultVariants: { active: false, softHover: false, collapsed: false, concealed: false },
  },
  TV,
);

/**
 * Recipe cho panel cấu hình (nút bánh răng + popover).
 *
 * Slots:
 *  - `trigger`        : nút bánh răng đứng cuối thanh Dock.
 *  - `panel`          : vỏ nội dung trong popover.
 *  - `panelHeader`    : hàng tiêu đề (ô icon + chữ).
 *  - `panelHeaderIcon`: ô icon nhỏ cạnh tiêu đề.
 *  - `panelTitle`     : chữ tiêu đề.
 *  - `sectionLabel`   : nhãn nhóm (chữ nhỏ viết hoa).
 *  - `optionList`     : cột chứa các hàng chọn chế độ.
 *  - `option`         : một hàng (ô icon + chữ + phần đuôi).
 *  - `optionIcon`     : ô icon vuông đầu hàng.
 *  - `optionBody`     : cụm chữ giữa hàng.
 *  - `optionState`    : chấm tròn báo đang chọn.
 *
 * Thêm biến thể mới → thêm key ở đây, KHÔNG sửa JSX.
 */
export const dockSettingsStyles = tv(
  {
    slots: {
      trigger: [
        'group relative flex size-11 shrink-0 items-center justify-center outline-none',
        'border border-transparent bg-transparent text-fg-3',
        'origin-bottom transition duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1)]',
        'hover:-translate-y-0.5 hover:scale-[1.12] hover:bg-nav-hover-bg hover:text-fg-1',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
        'touch:size-10',
      ],
      panel: 'w-64 p-1.5',
      panelHeader: 'flex items-center gap-2 px-1.5 pt-1 pb-2',
      panelHeaderIcon: [
        'flex size-6 shrink-0 items-center justify-center',
        'bg-nav-active-bg text-fg-on-nav-accent [&>svg]:size-3.5!',
      ],
      panelTitle: 'text-caption-12-semibold text-fg-on-popup',
      /**
       * Nhãn nhóm. `tracking-[0.12em]` là KHOẢNG CÁCH CHỮ, không phải cỡ chữ —
       * cỡ và độ đậm vẫn đi qua token `text-caption-10-semibold` đúng
       * `font-system.md`.
       */
      sectionLabel: [
        'block px-2 pt-2 pb-1',
        'text-caption-10-semibold uppercase tracking-[0.12em] text-fg-on-popup-muted',
      ],
      optionList: 'flex flex-col gap-0.5',
      option: [
        'group/option flex w-full items-center gap-2.5 px-2 py-1.5 text-left outline-none',
        'transition-colors duration-150',
        'hover:bg-nav-hover-bg',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      ],
      optionIcon: [
        'flex size-7 shrink-0 items-center justify-center',
        'bg-nav-hover-bg text-fg-on-popup-muted transition-colors duration-150',
        '[&>svg]:size-3.5!',
      ],
      /** `min-w-0` BẮT BUỘC — thiếu nó thì `truncate` của con không bao giờ ăn. */
      optionBody: 'flex min-w-0 flex-1 flex-col',
      optionState: [
        'flex size-4 shrink-0 items-center justify-center rounded-full border',
        'border-fg-on-popup-muted/50 transition-colors duration-150',
        '[&>svg]:size-2.5!',
      ],
    },
    variants: {
      /** Hàng đang được chọn (chế độ hiện hành). */
      selected: {
        true: {
          option: 'bg-nav-active-bg hover:bg-nav-active-bg',
          optionIcon: 'bg-nav-active-bg text-fg-on-nav-accent',
          optionState: 'border-ring-focus bg-ring-focus text-fg-inverse',
        },
      },
      /** Nhuộm riêng ô icon mà KHÔNG nhuộm cả hàng — dùng cho công tắc đang bật. */
      accent: {
        true: { optionIcon: 'bg-nav-active-bg text-fg-on-nav-accent' },
      },
      /**
       * Còn NHÌN THẤY nhưng không bấm được (máy chạm bị ép `pinned`).
       *
       * ⛔ CỐ Ý KHÔNG ẨN: ẩn đi thì người dùng tưởng phần mềm thiếu chức năng;
       *    để mờ kèm một dòng giải thích thì họ hiểu vì sao tạm thời không dùng
       *    được ở đây.
       */
      locked: {
        true: { option: 'pointer-events-none opacity-45' },
      },
      /** Popover đang mở → nút bánh răng giữ trạng thái sáng. */
      triggerOpen: {
        true: { trigger: 'bg-nav-active-bg text-fg-on-nav-accent' },
      },
    },
    defaultVariants: {
      selected: false,
      accent: false,
      locked: false,
      triggerOpen: false,
    },
  },
  TV,
);
