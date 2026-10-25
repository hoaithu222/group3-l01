/**
 * popup-surface.theme.ts — bề mặt dùng chung cho MỌI lớp nổi kiểu "menu".
 *
 * Ba nơi dùng: `actions/Menu`, `actions/ContextMenu`, `overlays/Popover`.
 *
 * ── Vì sao gom ───────────────────────────────────────────────────────────────
 * Trước đây ba file khai lại y hệt nhau, và chính chú thích trong code đã tự
 * thú: `ContextMenu.tsx` ghi "SYNC với Menu.tsx / Popover.tsx". Đồng bộ bằng
 * lời hứa thì sớm muộn cũng lệch — và nó đã lệch thật: Popover dùng `border-2`
 * còn hai file kia dùng `border`, nên cùng một "glass popup" mà viền chỗ 1px
 * chỗ 2px.
 *
 * ── Màu ──────────────────────────────────────────────────────────────────────
 * Quầng sáng cũ viết `rgba(45,212,191,0.15)` — đó chính là `teal-5` (#2DD4BF)
 * chép tay. Đổi palette là nó ở lại màu cũ. Nay đi qua `color-mix()` trên
 * `var(--color-teal-5)`, đúng luật đã ghi ở `modal.theme.ts`.
 */
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/** Quầng teal + đổ bóng — hai kênh, viết bằng token thay vì rgba chép tay. */
const POPUP_SHADOW =
  'shadow-[0_0_20px_color-mix(in_srgb,var(--color-teal-5)_15%,transparent),0_10px_30px_var(--color-popup-shadow)]';

/** Nền kính + viền teal. `borderWidth` là điểm KHÁC BIỆT duy nhất giữa 3 nơi dùng. */
export const popupSurface = tv(
  {
    base: [
      'z-50 overflow-hidden',
      'border-teal-5/30 bg-bg-popup backdrop-blur-md',
      POPUP_SHADOW,
      // Hiện/ẩn theo `data-state` của Radix.
      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[state=open]:duration-150 data-[state=closed]:duration-100',
    ],
    variants: {
      borderWidth: { thin: 'border', thick: 'border-2' },
    },
    defaultVariants: { borderWidth: 'thin' },
  },
  { twMergeConfig: twMergeFontExtend },
);

/**
 * Một dòng trong menu — tint teal + vạch nhấn bên trái khi được trỏ tới.
 *
 * `border-l-2 border-transparent` luôn có mặt để lúc nhấn không bị nhảy 2px:
 * chỉ đổi MÀU vạch, không thêm bề rộng.
 */
export const POPUP_ITEM_CLASS = [
  'flex items-center gap-3 px-3 py-2.5 text-body-14 text-fg-on-popup',
  'outline-none cursor-pointer select-none transition-colors duration-150',
  'border-l-2 border-transparent',
  'data-[highlighted]:bg-teal-5/10 data-[highlighted]:border-teal-5/60 data-[highlighted]:text-fg-1',
  'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
].join(' ');

/** Icon đứng đầu dòng menu. */
export const POPUP_ITEM_ICON_CLASS =
  'inline-flex items-center justify-center shrink-0 size-5 text-fg-on-popup-muted';
