/**
 * Recipe + hằng số của `PanelCard`.
 *
 * Tách khỏi component theo `clean-code-standards.md` §3: JSX của primitive kit2
 * được phép dài, nhưng `tv()` và hằng số thì luôn phải ra file `*.theme.ts`.
 *
 * ── Ba trục biến thể, và vì sao chỉ có ba ───────────────────────────────────
 *   `density`  — mật độ. Quyết định CHIỀU CAO HEADER + đệm thân + bậc chữ tiêu
 *                đề. Ba bậc vì màn dashboard thật cần đúng ba: ô lưới chật
 *                (`compact`), panel thường (`default`), panel hero / toàn màn
 *                hình (`relaxed`).
 *   `variant`  — nền. `hud` (khung `HudFrame`) · `overlay` (tấm đè lên viewer
 *                3D/ảnh) · `plain` (không khung, dùng khi card đã nằm trong một
 *                khung khác — KHÔNG lồng hai `HudFrame`, hai quầng sáng cộng lại
 *                là mất cạnh khung).
 *   `flushBody`— thân tràn viền, cho viewer/bảng/camera tự lo đệm.
 *
 * ⛔ KHÔNG thêm trục "màu": màu đi qua `tone` của `HudFrame` (14 giá trị
 *    `TitleIconColor`), không nhân bản thành variant ở đây.
 */
import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

export const panelCard = tv(
  {
    slots: {
      /** Vỏ dùng cho `variant="plain"` / `"overlay"` — bản `hud` do HudFrame lo. */
      root: 'flex h-full min-h-0 flex-col overflow-hidden',
      /**
       * Thân KHÔNG `overflow-auto` mặc định mà `overflow-hidden`.
       *
       * Panel dashboard hầu hết chứa chart/bảng tự quản việc cuộn của mình; mở
       * sẵn `auto` ở đây thì mỗi lần chart tính chiều cao lệch 1px là mọc một
       * thanh cuộn ngoài rìa chart. Cần cuộn thì truyền
       * `bodyClassName="overflow-auto"` — một dòng, và có chủ ý.
       */
      body: 'relative min-h-0 flex-1 overflow-hidden',
      footer: 'flex shrink-0 items-center justify-between gap-2 border-t border-border-1',
      /** Hàng tiêu đề trong header — tên box + ghi chú số tổng. */
      titleRow: 'flex min-w-0 items-baseline gap-1',
      title: 'truncate uppercase tracking-wide text-fg-1',
      note: 'shrink-0 tabular-nums text-fg-3',
      /**
       * Ô trạng thái (đang tải / rỗng) — chiếm trọn thân, căn giữa.
       *
       * KHÔNG có đệm riêng: đệm đã nằm ở `body`. Chỉ `flushBody` mới tự cấp
       * đệm cho nó (xem variant bên dưới) — thân tràn viền là để chart/viewer tự
       * lo mép của chúng, còn dòng "Chưa có dữ liệu" thì không tự lo được và sẽ
       * dính sát khung.
       */
      state: 'flex h-full min-h-0 flex-col items-center justify-center gap-2',
    },
    variants: {
      density: {
        compact: {
          body: 'p-1.5',
          footer: 'px-1.5 py-1',
          title: 'text-caption-12-bold',
          note: 'text-caption-10',
        },
        default: {
          body: 'p-2',
          footer: 'px-2 py-1.5',
          title: 'text-caption-12-bold',
          note: 'text-caption-12',
        },
        relaxed: {
          body: 'p-3',
          footer: 'px-3 py-2',
          title: 'text-body-14-semibold',
          note: 'text-caption-12',
        },
      },
      variant: {
        hud: {},
        /**
         * Tấm ĐÈ lên nội dung khác (viewer BIM, ảnh camera).
         *
         * Nền ĐỤC 92% + viền tone, KHÔNG `backdrop-blur`: `backdrop-filter` ép
         * phần tử thành composited layer riêng, mà tấm này neo theo ô lưới tính
         * bằng % nên mép layer gần như luôn rơi vào nửa pixel thiết bị — chữ và
         * nét vẽ bên trong bị nội suy lại, ra đúng cảm giác "chưa nét". Ở mức
         * 92% đục thì cũng gần như không còn gì phía sau để làm mờ.
         *
         * Nền là `bg-1` (token TỰ LẬT theme) pha tone, KHÔNG phải một bậc
         * palette cố định: bậc cố định (vd `azure-6`) giống hệt nhau ở light và
         * dark, nên sang theme sáng là chữ `fg-*` gần đen nằm trên nền navy.
         */
        overlay: {
          root: 'border border-border-2 shadow-lg bg-[color-mix(in_srgb,var(--color-bg-1)_92%,transparent)]',
        },
        /** Không khung — card nằm sẵn trong một khung khác. */
        plain: { root: 'border border-border-1 bg-bg-1' },
      },
      /** Thân tràn viền — viewer / bảng / camera tự lo đệm của nó. */
      flushBody: { true: { body: 'p-0', state: 'p-3' } },
    },
    defaultVariants: { density: 'default', variant: 'hud', flushBody: false },
  },
  // `text-caption-12-bold` là token CỠ CHỮ, không phải màu — thiếu config này
  // tailwind-merge sẽ để `text-fg-1` nuốt mất cỡ chữ (tailwind-conventions.md).
  { twMergeConfig: twMergeFontExtend },
);

export type PanelCardDensity = NonNullable<VariantProps<typeof panelCard>['density']>;
export type PanelCardVariant = NonNullable<VariantProps<typeof panelCard>['variant']>;

/**
 * Hình học của header theo `density` — truyền thẳng xuống `DetailPanelHeader`.
 *
 * Vì sao ghi đè bằng `className`/`innerClassName` thay vì thêm bậc `size` mới
 * vào `DetailPanelHeader`: đây là mật độ RIÊNG của card dashboard, không phải
 * một bậc dùng chung cho mọi header panel trong kit2.
 *
 * `compact` = 28px (`min-h-7`) + đệm ngang 6px: hàng header của ô lưới là hàng
 * chật nhất màn — nó phải chứa 3 vạch chéo + tên box + ghi chú + cụm nút, trong
 * cột chỉ ~260–300px ở laptop 14". Mỗi px lấy của header là một px trả cho vùng
 * vẽ chart bên dưới.
 */
export const PANEL_CARD_HEADER: Record<
  PanelCardDensity,
  { size: 'sm' | 'md'; className: string; innerClassName: string }
> = {
  compact: { size: 'sm', className: 'min-h-7', innerClassName: 'gap-1 px-1.5 py-0.5' },
  default: { size: 'sm', className: 'min-h-8', innerClassName: 'gap-1.5 px-2 py-1' },
  relaxed: { size: 'md', className: 'min-h-10', innerClassName: 'gap-2 px-3 py-1.5' },
};

/**
 * Cỡ icon trong nút hành động của header, theo `density`.
 *
 * Nút giữ `size="xs"` ở mọi bậc (28px — sàn bấm được của kit2); chỉ RUỘT icon co
 * lại. Phóng cả nút ở bậc `compact` là đội chiều cao header của cả lưới card.
 */
export const PANEL_CARD_ACTION_ICON: Record<PanelCardDensity, number> = {
  compact: 12,
  default: 14,
  relaxed: 16,
};

/**
 * Nới VÙNG CHẠM của nút header mà KHÔNG phóng nút.
 *
 * Header cao 28px không có chỗ cho nút 44px, nhưng ngón tay thì vẫn cần 44px.
 * `::after` trải rộng ra ngoài biên nút và bắt sự kiện chạm hộ — nút vẫn 28px về
 * hình, 40px về vùng chạm. Chỉ bật ở `touch:` nên chuột không đổi gì.
 */
export const PANEL_CARD_TOUCH_HIT =
  "relative touch:after:absolute touch:after:-inset-1.5 touch:after:content-['']";
