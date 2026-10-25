import { tv, type VariantProps } from 'tailwind-variants';

import type { IconSize, ThemeColorKey } from '@/shared/theme';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `LinkButton`.
 *
 * ── Số đo lấy từ Figma section `Buttons Link` (259:87708) ───────────────────
 * Component set `Button/bt link`, thuộc tính `Type` × `Size` × `State` × `Theme`.
 * Nút này KHÔNG có nền, KHÔNG có viền, KHÔNG có đệm — chỉ chữ + icon tuỳ chọn,
 * khe giữa hai thứ đó là 4 (giống `Button`).
 *
 *   Size=Lg → chữ 16/24 · icon 24   (đo trực tiếp: node 259:87938)
 *   Size=Md → chữ 14/20 · icon 20   ┐ suy ra theo đúng thang của `Button`; số
 *   Size=Sm → chữ 12/16 · icon 16   ┘ đo gốc chưa lấy được (xem báo cáo).
 *
 * ── Gạch chân là DẤU HIỆU BẤM, không phải kiểu chữ mặc định ─────────────────
 * Trong Figma trạng thái `Default` KHÔNG gạch chân; `Hover`/`Press`/`Focus`
 * đều gạch chân. Trên di động chỉ còn `Press`, nên gạch chân xuất hiện đúng lúc
 * ngón tay đang đè — đó là phản hồi chạm duy nhất của một nút không có nền.
 */
export const linkButtonStyles = tv(
  {
    slots: {
      pressable: 'self-start',
      root: 'relative flex-row items-center justify-center',
      content: 'flex-row items-center justify-center gap-2xs',
      label: 'font-semibold',
      spinner: 'absolute inset-0 items-center justify-center',
    },

    variants: {
      /**
       * Tên trong Figma → tên ở đây: Primary → `primary` · White → `white` ·
       * Red → `danger` · Green → `success` · Blue → `info` · Orange → `warning`.
       */
      tone: {
        primary: { label: 'text-fg-brand' },
        /** Dùng trên nền tối; `action-white` giữ trắng ở cả hai theme. */
        white: { label: 'text-action-white' },
        danger: { label: 'text-error' },
        success: { label: 'text-success' },
        /** `link` và `info` cùng giá trị; chọn `link` vì đây là nút liên kết. */
        info: { label: 'text-link' },
        warning: { label: 'text-warning' },
      },

      size: {
        lg: { label: 'text-label-lg' },
        md: { label: 'text-label-md' },
        sm: { label: 'text-label-sm' },
      },

      /** Suy ra trong component. `Hover`/`Focus` của Figma bị BỎ — xem AGENTS.md. */
      state: {
        default: {},
        press: {},
        disabled: {},
        loading: {},
      },
    },

    compoundVariants: [
      /**
       * ⛔ Gạch chân là thay đổi DUY NHẤT lúc bấm — đừng thêm đổi màu chữ.
       *
       * Đo điểm ảnh cột `Press` (theme `Ma`): Primary `#00453C`, Red `#C30000`,
       * Blue `#1043A9`, White `#FFFFFF` — trùng khít cột `Default`. Bản trước
       * kéo `primary` xuống `action-press` và `white` xuống trắng 60%, tức chữ
       * TỐI đi / MỜ đi đúng lúc ngón tay che mất nó.
       */
      { state: 'press', class: { label: 'underline' } },
      { state: 'disabled', class: { label: 'text-action-disabled-fg' } },
      /**
       * ⚠️ `white` là ngoại lệ: nó sống trên nền TỐI, nên bậc khoá của nó là
       * TRẮNG 80% (`Foreground/White/Disabled` `#FFFFFFCC`, đo được `#CDCDCD`
       * trên nền `#070707`), không phải xám `#969696` như các tone còn lại.
       * Dùng xám ở đây thì tương phản tụt xuống ~2:1 — gần như không đọc được.
       */
      { state: 'disabled', tone: 'white', class: { label: 'text-action-white-disabled' } },
      /** Nhãn trong suốt chứ không gỡ — giữ nguyên bề rộng, xem `button.styles.ts`. */
      { state: 'loading', class: { content: 'opacity-0' } },
    ],

    defaultVariants: { tone: 'primary', size: 'lg', state: 'default' },
  },
  { twMergeConfig },
);

export type LinkButtonVariants = VariantProps<typeof linkButtonStyles>;
export type LinkButtonTone = NonNullable<LinkButtonVariants['tone']>;
export type LinkButtonSize = NonNullable<LinkButtonVariants['size']>;

/** ⛔ Bảng riêng vì `<Icon>`/`<ActivityIndicator>` không nhận `className`. */
export const LINK_CONTENT_COLOR: Record<LinkButtonTone, ThemeColorKey> = {
  primary: 'fg-brand',
  white: 'action-white',
  danger: 'error',
  success: 'success',
  info: 'link',
  warning: 'warning',
};

/**
 * Màu icon lúc KHOÁ.
 *
 * ⛔ Không dùng được một hằng số duy nhất: `white` sống trên nền tối nên bậc
 * khoá của nó là trắng 80%, còn mọi tone khác là xám `Foreground/Ink/Disable`.
 * Bảng phải khớp từng dòng với compound `state: 'disabled'` ở trên — icon và
 * chữ lệch màu nhau thì nhìn ra ngay.
 *
 * ⚠️ KHÔNG có bảng màu cho `press`: Figma giữ NGUYÊN màu lúc bấm (xem
 * compound `state: 'press'`), nên icon cũng giữ nguyên `LINK_CONTENT_COLOR`.
 */
export const LINK_DISABLED_CONTENT_COLOR: Record<LinkButtonTone, ThemeColorKey> = {
  primary: 'action-disabled-fg',
  white: 'action-white-disabled',
  danger: 'action-disabled-fg',
  success: 'action-disabled-fg',
  info: 'action-disabled-fg',
  warning: 'action-disabled-fg',
};

export const LINK_ICON_SIZE: Record<LinkButtonSize, IconSize> = {
  lg: 'md',
  md: 'sm',
  sm: 'xs',
};
