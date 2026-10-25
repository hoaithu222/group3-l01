import { forwardRef } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';

/**
 * Badge — pill-shaped status indicator.
 *
 * Maps Figma "type × stage" two-axis model → `color × variant`:
 *   - `variant="tinted"`   (Figma "Default") — translucent bg + saturated text
 *   - `variant="solid"`    (Figma "Filled")  — saturated bg + white text
 *   - `variant="disabled"` (Figma "Disable") — translucent bg + darkened text
 *
 * Token contract (Figma node 76:3123 — rev.2), dùng semantic scale, KHÔNG palette thô:
 *   - tinted   → sáng `bg-{color}-6/20` + `text-{color}-7|8` · tối `bg-{color}-6/30` + `text-{color}-5`
 *   - solid    → `bg-{color}-6`     + `text-neutral-0`
 *   - disabled → `bg-{color}-6/30` + `text-{color}-8`
 *
 * Ngoại lệ theo design: `neutral` dùng scale 5/4/7 · `accent`+`warning` disabled
 * dùng scale -9 (scale -8 quá sáng trên nền tint vàng).
 */
const badge = tv(
  {
    slots: {
      /*
       * `whitespace-nowrap` — chip KHÔNG BAO GIỜ xuống dòng. Thiếu nó, nhãn nhiều chữ ("Quản trị
       * viên") trong cột bảng hẹp gãy thành viên thuốc HAI dòng, cao gấp đôi hàng bên cạnh — đã chụp
       * lại ở trang Nhật ký. Chật thì phần chữ khác (tên, mô tả) `truncate` nhường chỗ.
       */
      base: ['inline-flex items-center justify-center whitespace-nowrap rounded-full align-middle'],
      icon: 'inline-flex items-center justify-center shrink-0',
      dot: 'shrink-0 rounded-full bg-current',
    },
    variants: {
      color: {
        primary: {},
        secondary: {},
        accent: {},
        info: {},
        indigo: {},
        success: {},
        warning: {},
        error: {},
        neutral: {},
      },
      variant: {
        tinted: {},
        solid: {},
        disabled: {},
        /** Ghost — chỉ viền + chữ theo màu, nền trong suốt. */
        outline: {},
      },
      size: {
        /**
         * Large — badge đứng MỘT MÌNH làm nhãn trạng thái của cả một thẻ (card
         * dashboard), không phải chip phụ trong ô bảng. Ở đó 12px đọc quá bé.
         * 14px/20 semibold + icon 16.
         */
        lg: {
          base: 'min-w-7 gap-1 px-2 py-0.5 text-body-14-semibold',
          icon: 'size-4',
          dot: 'size-1.5',
        },
        /** Default — đúng Figma: min-w 24, px 6, py 2, gap 4, text 12/16 semibold, icon 16. */
        md: {
          base: 'min-w-6 gap-1 px-1.5 py-0.5 text-caption-12-semibold',
          icon: 'size-4',
          dot: 'size-1',
        },
        /** Small — compact, dùng cho table cell, dense list (12px/14 text, 14px icon). */
        sm: {
          base: 'min-w-5 gap-1 px-1.5 py-0.5 text-caption-12-tight-medium',
          icon: 'size-3.5',
          dot: 'size-1',
        },
        /** Extra small — micro chip, count indicator (10px/12 text, 12px icon). */
        xs: {
          base: 'min-w-4 gap-0.5 px-1 py-0 text-caption-10-tight-medium',
          icon: 'size-3',
          dot: 'size-1',
        },
      },
    },
    compoundVariants: [
      /*
       * `tinted` + `outline` khai HAI bậc chữ: theme sáng `-7` (họ sáng — success · accent ·
       * warning — xuống `-8`), theme tối giữ `-5` qua `dark:`.
       *
       * Vì sao: thang màu tông KHÔNG lật theo theme. Bậc `-5` chỉ hợp nền navy — trên nền tint
       * sáng nó còn 1.3–2.9:1 (chip "Hoạt động" `success-5` #00E676 gần như biến mất), dưới
       * ngưỡng 4.5:1 của `text-contrast.md §1`. Bậc `-7`/`-8` ở theme sáng đưa mọi màu về ≥ 4.6:1.
       * Nền theme sáng hạ `/30` → `/20` để chip không đục thành mảng màu cạnh chữ đậm.
       */
      // primary — tím thương hiệu
      {
        color: 'primary',
        variant: 'tinted',
        class: { base: 'bg-primary-6/20 text-primary-7 dark:bg-primary-6/30 dark:text-primary-5' },
      },
      { color: 'primary', variant: 'solid', class: { base: 'bg-primary-6 text-neutral-0' } },
      { color: 'primary', variant: 'disabled', class: { base: 'bg-primary-6/30 text-primary-8' } },
      // secondary — cyan
      {
        color: 'secondary',
        variant: 'tinted',
        class: {
          base: 'bg-secondary-6/20 text-secondary-7 dark:bg-secondary-6/30 dark:text-secondary-5',
        },
      },
      { color: 'secondary', variant: 'solid', class: { base: 'bg-secondary-6 text-neutral-0' } },
      {
        color: 'secondary',
        variant: 'disabled',
        class: { base: 'bg-secondary-6/30 text-secondary-8' },
      },
      // accent — gold
      {
        color: 'accent',
        variant: 'tinted',
        class: { base: 'bg-accent-6/20 text-accent-8 dark:bg-accent-6/30 dark:text-accent-5' },
      },
      { color: 'accent', variant: 'solid', class: { base: 'bg-accent-6 text-neutral-0' } },
      { color: 'accent', variant: 'disabled', class: { base: 'bg-accent-6/30 text-accent-9' } },
      // info — royal blue
      {
        color: 'info',
        variant: 'tinted',
        class: { base: 'bg-info-6/20 text-info-7 dark:bg-info-6/30 dark:text-info-5' },
      },
      { color: 'info', variant: 'solid', class: { base: 'bg-info-6 text-neutral-0' } },
      { color: 'info', variant: 'disabled', class: { base: 'bg-info-6/30 text-info-8' } },
      // indigo
      {
        color: 'indigo',
        variant: 'tinted',
        class: { base: 'bg-indigo-6/20 text-indigo-7 dark:bg-indigo-6/30 dark:text-indigo-5' },
      },
      { color: 'indigo', variant: 'solid', class: { base: 'bg-indigo-6 text-neutral-0' } },
      { color: 'indigo', variant: 'disabled', class: { base: 'bg-indigo-6/30 text-indigo-8' } },
      // warning — amber
      {
        color: 'warning',
        variant: 'tinted',
        class: { base: 'bg-warning-6/20 text-warning-8 dark:bg-warning-6/30 dark:text-warning-5' },
      },
      { color: 'warning', variant: 'solid', class: { base: 'bg-warning-6 text-neutral-0' } },
      { color: 'warning', variant: 'disabled', class: { base: 'bg-warning-6/30 text-warning-9' } },
      // success — green
      {
        color: 'success',
        variant: 'tinted',
        class: { base: 'bg-success-6/20 text-success-8 dark:bg-success-6/30 dark:text-success-5' },
      },
      { color: 'success', variant: 'solid', class: { base: 'bg-success-6 text-neutral-0' } },
      { color: 'success', variant: 'disabled', class: { base: 'bg-success-6/30 text-success-8' } },
      // error — rose
      {
        color: 'error',
        variant: 'tinted',
        class: { base: 'bg-error-6/20 text-error-7 dark:bg-error-6/30 dark:text-error-5' },
      },
      { color: 'error', variant: 'solid', class: { base: 'bg-error-6 text-neutral-0' } },
      { color: 'error', variant: 'disabled', class: { base: 'bg-error-6/30 text-error-8' } },
      // neutral — slate (design dùng scale 5/4/7, khác các màu còn lại)
      { color: 'neutral', variant: 'tinted', class: { base: 'bg-neutral-5/20 text-fg-3' } },
      { color: 'neutral', variant: 'solid', class: { base: 'bg-neutral-7 text-neutral-0' } },
      { color: 'neutral', variant: 'disabled', class: { base: 'bg-neutral-5/20 text-fg-5' } },
      // ── outline (ghost) — viền + chữ theo màu, nền trong suốt ──────────────────
      // Cùng luật hai bậc với `tinted`: viền `-6` + chữ `-7`/`-8` ở theme sáng, `-5` ở theme tối.
      {
        color: 'primary',
        variant: 'outline',
        class: {
          base: 'border border-primary-6 bg-transparent text-primary-7 dark:border-primary-5 dark:text-primary-5',
        },
      },
      {
        color: 'secondary',
        variant: 'outline',
        class: {
          base: 'border border-secondary-6 bg-transparent text-secondary-7 dark:border-secondary-5 dark:text-secondary-5',
        },
      },
      {
        color: 'accent',
        variant: 'outline',
        class: {
          base: 'border border-accent-6 bg-transparent text-accent-8 dark:border-accent-5 dark:text-accent-5',
        },
      },
      {
        color: 'info',
        variant: 'outline',
        class: {
          base: 'border border-info-6 bg-transparent text-info-7 dark:border-info-5 dark:text-info-5',
        },
      },
      {
        color: 'indigo',
        variant: 'outline',
        class: {
          base: 'border border-indigo-6 bg-transparent text-indigo-7 dark:border-indigo-5 dark:text-indigo-5',
        },
      },
      {
        color: 'warning',
        variant: 'outline',
        class: {
          base: 'border border-warning-6 bg-transparent text-warning-8 dark:border-warning-5 dark:text-warning-5',
        },
      },
      {
        color: 'success',
        variant: 'outline',
        class: {
          base: 'border border-success-6 bg-transparent text-success-8 dark:border-success-5 dark:text-success-5',
        },
      },
      {
        color: 'error',
        variant: 'outline',
        class: {
          base: 'border border-error-6 bg-transparent text-error-7 dark:border-error-5 dark:text-error-5',
        },
      },
      {
        color: 'neutral',
        variant: 'outline',
        class: { base: 'border border-neutral-5 bg-transparent text-fg-4' },
      },
    ],
    defaultVariants: {
      color: 'primary',
      variant: 'tinted',
      size: 'md',
    },
  },
  {
    // Teach tv()'s internal tailwind-merge that `text-caption-*` (+ other font
    // tokens) are font-size, not color — otherwise the size variant's font-size
    // gets dropped when a compound-variant text-color joins the same slot.
    twMergeConfig: twMergeFontExtend,
  },
);

type BadgeVariants = VariantProps<typeof badge>;
export type BadgeColor = NonNullable<BadgeVariants['color']>;
export type BadgeVariant = NonNullable<BadgeVariants['variant']>;
export type BadgeSize = NonNullable<BadgeVariants['size']>;

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>, BadgeVariants {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  /** Show a small 4px dot before the label (uses current text color). */
  dot?: boolean;
  /**
   * Hiện nút "x" cuối badge — bấm để gỡ (chip/tag chọn nhiều, filter đang áp
   * dụng…). Không truyền = badge hiển thị thuần, không đổi hành vi hiện có.
   */
  onRemove?: () => void;
  /** aria-label cho nút "x" khi có `onRemove`. Mặc định "Xoá {children}". */
  removeLabel?: string;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      color,
      variant,
      size,
      startIcon,
      endIcon,
      dot: showDot = false,
      onRemove,
      removeLabel,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { base, icon, dot } = badge({ color, variant, size });

    return (
      <span ref={ref} className={base({ className })} {...props}>
        {startIcon && <span className={icon()}>{startIcon}</span>}
        {showDot && <span aria-hidden className={dot()} />}
        {children}
        {endIcon && <span className={icon()}>{endIcon}</span>}
        {onRemove && (
          <button
            aria-label={removeLabel ?? `Xoá ${typeof children === 'string' ? children : ''}`.trim()}
            className={icon({
              className:
                'cursor-pointer rounded-full hover:text-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring-focus',
            })}
            type="button"
            onClick={(event) => {
              // Badge có thể nằm trong 1 hàng/chip cha cũng có onClick riêng
              // (vd toggle chọn) — chặn nổi bọt để bấm "x" không kích hoạt luôn
              // hành vi của cha.
              event.stopPropagation();
              onRemove();
            }}
          >
            <SystemIcon name="xmark-outline" size={10} />
          </button>
        )}
      </span>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;
