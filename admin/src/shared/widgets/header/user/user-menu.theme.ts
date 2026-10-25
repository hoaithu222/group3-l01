/**
 * user-menu.theme.ts — token + `tv()` recipe cho CỤM NGƯỜI DÙNG ở mép phải
 * thanh header: nút trigger (avatar + tên + vai trò + caret) và phần thân của
 * panel menu thả xuống.
 *
 * ⚠️ VÌ SAO KHÔNG NẰM TRONG `header.theme.ts`
 * `widget-composition.md §1` yêu cầu mỗi widget MỘT file theme, nhưng thư mục
 * `header/` từ lâu đã theo mẫu THEME THEO NHÓM CON — `page-header/` có
 * `page-header.theme.ts` riêng vì file theme gốc quá lớn. Cụm user là nhóm con
 * thứ hai: mọi slot dưới đây CHỈ cụm này đọc, không nhóm nào khác dùng tới.
 *
 * ⛔ HAI THỨ PHẢI ĐỒNG BỘ VỚI `header.theme.ts`, KHÔNG được trôi khỏi nhau:
 *
 *  1. CHIỀU CAO — import thẳng `HEADER_CONTROL_HEIGHT`, KHÔNG chép con số.
 *     Logo · nút icon · khối user đứng cùng một hàng; lệch vài px là cả hàng
 *     đọc ra so le.
 *
 *  2. NGÔN NGỮ KHUNG — viền mảnh + NGOẶC GÓC ngoài + inner glow, y hệt
 *     `HEADER_ICON_BUTTON_CLASS`. Trigger đứng NGAY CẠNH dãy nút icon nên chỉ
 *     cần thiếu ngoặc góc là cụm phải đọc ra "một nút lạ ghép vào dãy".
 *     Hằng `BRACKET_CORNERS` bên `header.theme.ts` là hằng NỘI BỘ (không
 *     export) nên buộc phải viết lại ở đây. Khi nào gộp được hai file thì xoá
 *     bản sao này và import hằng chung — sửa một bên mà quên bên kia là hai
 *     khung lệch tông ngay.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

import { HEADER_CONTROL_HEIGHT } from '../header.theme';

/**
 * `tv()` có instance twMerge RIÊNG → phải dạy nó `text-body-14-medium` là
 * font-size chứ không phải màu (xem `cn.ts → twMergeFontExtend`).
 */
const TV = { twMergeConfig: twMergeFontExtend } as const;

/**
 * Ngoặc góc NGOÀI viền (trên-trái + dưới-phải) — BẢN SAO của `BRACKET_CORNERS`
 * trong `header.theme.ts`. 4 thanh ngoặc = 4 lớp `background` lấy
 * `currentColor`, nên đổi tông chỉ cần đổi `before:text-*`.
 *
 * ⛔ Vẽ trên `::before`. `::after` đã dành cho lớp TRONG SUỐT nới vùng chạm
 *    (`ipad-responsive.md §3.3`) — hai thứ tranh nhau một pseudo-element thì
 *    ngoặc dưới-phải nhảy lên góc trên-trái và vùng chạm chết theo.
 */
const BRACKET_CORNERS = [
  "before:pointer-events-none before:absolute before:-inset-0.5 before:content-['']",
  'before:text-primary-5/45 before:transition-colors before:duration-200',
  // [ngang trên-trái 8×2] [dọc trên-trái 2×8] [ngang dưới-phải 8×2] [dọc dưới-phải 2×8]
  'before:[background:linear-gradient(currentColor,currentColor)_no-repeat_left_top/8px_2px,linear-gradient(currentColor,currentColor)_no-repeat_left_top/2px_8px,linear-gradient(currentColor,currentColor)_no-repeat_right_bottom/8px_2px,linear-gradient(currentColor,currentColor)_no-repeat_right_bottom/2px_8px]',
].join(' ');

/** Transition đầy đủ cho surface đổi cả viền lẫn bóng. */
const FRAME_TRANSITION =
  'transition-[color,border-color,background-color,box-shadow] duration-200 ease-out';

export const userMenuStyles = tv(
  {
    slots: {
      /**
       * Nút trigger — cùng khung với `HEADER_ICON_BUTTON_CLASS` (viền mảnh,
       * ngoặc góc, inner glow) nhưng KHÔNG vuông: nó ôm avatar + tên + caret.
       *
       * Trạng thái mở đọc từ `data-state` do Radix Trigger (`asChild`) gắn vào
       * chính phần tử này — KHÔNG cần nâng state lên React.
       *
       * ⚠️ Mọi class `shadow-[...]` viết LITERAL, KHÔNG nội suy `${...}`:
       *    scanner của Tailwind v4 đọc file dạng văn bản thuần.
       */
      trigger: [
        'group relative inline-flex shrink-0 cursor-pointer items-center text-left outline-none',
        HEADER_CONTROL_HEIGHT,
        'gap-1 pl-0.5 pr-1 md:gap-1.5 md:pl-1 md:pr-1.5 wide:gap-2.5 wide:pl-1.5 wide:pr-2.5',
        'border border-primary-5/25 bg-transparent text-fg-on-nav',
        FRAME_TRANSITION,
        BRACKET_CORNERS,
        // ⛔ `text-*` chứ KHÔNG `border-*`: ngoặc vẽ bằng `background` lấy
        //    `currentColor`, đặt `hover:before:border-*` là sinh class chết.
        'hover:before:text-primary-5',
        'hover:border-primary-5/60 hover:bg-nav-hover-bg',
        'hover:shadow-[inset_0_0_12px_var(--color-bg-primary)]',
        'data-[state=open]:border-primary-5/60 data-[state=open]:bg-nav-active-bg',
        'data-[state=open]:shadow-[inset_0_0_12px_var(--color-bg-primary)]',
        'data-[state=open]:before:text-primary-5',
        // Vùng chạm nới DỌC bằng lớp `::after` trong suốt — cùng cơ chế với
        // `HEADER_ICON_BUTTON_CLASS`, KHÔNG phóng to nút.
        "touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-1.5 touch:after:content-['']",
        'active:scale-[0.99]',
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      ],
      /**
       * Vạch accent dẫn vào khối user — nhịp với `tick` phân nhóm của thanh.
       * Ẩn dưới `md`: khi tên + vai trò đã ẩn, khối user chỉ còn avatar, một
       * vạch dẫn vào đó không dẫn tới đâu cả.
       */
      accentBar: 'hidden h-4 w-0.5 shrink-0 bg-primary-5/70 md:block wide:h-5',
      avatarWrap: 'relative shrink-0 pt-[2px]',
      /**
       * Avatar 20px (laptop) → 28px (`wide`). PHẢI override qua `className`:
       * prop `size` của `<Avatar>` chỉ nhận MỘT giá trị nên không tự lên bậc
       * theo màn được, mà `size="sm"` (32px) thì CAO HƠN cả trigger 30px.
       */
      avatar: 'size-5 wide:size-7',
      /**
       * Chấm trạng thái online — viền cùng màu nền đáy header (`header-to`) để
       * tạo hiệu ứng "khoét" gọn quanh chấm ở cả light lẫn dark.
       */
      status: [
        'pointer-events-none absolute -bottom-0.5 -right-0.5',
        'size-2 rounded-full border-2 border-header-to bg-success wide:size-2.5',
      ],
      /**
       * ⛔ ẨN dưới `lg`: cụm tên + vai trò ăn ~100px — bằng cả một chip nav.
       *    KHÔNG mất thông tin: avatar vẫn mở được menu và panel hiện đầy đủ
       *    tên · vai trò · email, chỉ mất một bước bấm.
       *
       * `max-w` là TRẦN theo bậc màn, không phải bề rộng cố định — tên ngắn
       * thì cụm vẫn tự co.
       */
      info: [
        'hidden min-w-0 flex-col gap-0.5 leading-none lg:flex',
        'lg:max-w-[92px] xl:max-w-[100px] 2xl:max-w-[110px] wide:max-w-[200px]',
      ],
      name: 'truncate text-caption-12-medium text-fg-on-nav wide:text-body-14-medium',
      /**
       * Vai trò dạng micro-label VIẾT HOA giãn chữ thay cho pill `<Badge>` —
       * trong thanh cao 30px, pill làm khối bị chật và phá nhịp chữ. Pill vẫn
       * còn, nhưng ở PANEL (xem `panelRole`) nơi có đủ chỗ thở.
       */
      role: [
        'truncate text-caption-10-medium uppercase text-fg-on-nav-subtle',
        'tracking-[0.06em] wide:tracking-[0.14em]',
      ],
      /**
       * ⛔ `size-3!` — `!` BẮT BUỘC: `SystemIcon` set width/height bằng INLINE
       *    STYLE nên class thường thua specificity và caret không lên bậc.
       * Ẩn dưới `md`: trigger còn mỗi avatar thì avatar CHÍNH LÀ nút, mũi tên
       * chỉ ăn thêm bề ngang.
       */
      caret: [
        'hidden shrink-0 text-fg-on-nav-subtle transition-transform duration-200 md:block',
        'size-3! wide:size-3.5!',
        // Xoay theo `data-state` của trigger (phần tử cha) — cùng lý do ở `trigger`.
        'group-hover:text-primary-5 group-data-[state=open]:rotate-180',
      ],
      /**
       * Panel menu. Bề rộng tối thiểu 264px (kit2 `<Menu>` mặc định 220px) để
       * email công ty không bị `truncate` ngay từ ký tự thứ hai mươi; TRẦN
       * `max-w` giữ panel không phình theo dòng dài nhất trên màn hẹp.
       */
      panel: 'min-w-[264px] max-w-[min(92vw,320px)]',
      /** Thẻ thông tin user ở đầu panel — `<Menu>` đã tự bọc padding + divider. */
      panelHeader: 'flex items-center gap-3',
      panelIdentity: 'flex min-w-0 flex-1 flex-col',
      /** Khoảng thở giữa tên và pill vai trò. */
      panelRole: 'mt-0.5',
    },
  },
  TV,
);
