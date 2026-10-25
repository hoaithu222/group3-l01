/**
 * Button — kit2 button system với multi-skin × multi-variant matrix.
 *
 * Axes:
 *  - `variant`: primary | secondary | stroke | ghost
 *  - `skin`:    base (default — brand cyan) | accent (vàng) | danger (đỏ) | neutral (xám)
 *  - `size`:    xl | lg | md | sm
 *
 * Hover strategy:
 *  - `primary` / `secondary`: gradient giữ nguyên, dùng `hover:brightness-110`
 *    để làm sáng nhẹ — không gây nhảy màu gradient, works ở cả light/dark.
 *  - `stroke` / `ghost`: overlay opacity `hover:bg-{color}/10` thay vì màu tĩnh
 *    (vd `primary-1`, `red-1`). Opacity-based blend đúng theme tự động.
 *  - `neutral` stroke/ghost: dùng semantic token `bg-bg-2/3`, `text-fg-1/2/3`.
 *  - Focus ring dùng semantic `ring-ring-focus` (flip mode).
 *
 * ⛔ Màu CHỮ/VIỀN của `stroke` / `ghost` BẮT BUỘC dùng token semantic tự flip
 * theme (`action-base`, `action-accent`, `error`), KHÔNG dùng bậc số `-7`.
 * Thang `-1..-10` KHÔNG flip giữa light/dark, nên `-7` (bậc tối, đúng cho nền
 * trắng) chìm hẳn trên nền navy: `primary-7` chỉ đạt 3.40:1 trên `bg-1` dark.
 * Đổi sang `-5` cũng SAI vì phá chiều ngược lại (`primary-5` còn 2.28:1 trên
 * nền trắng, `accent-5` còn 1.75:1). Chỉ token semantic mới đúng cả hai theme.
 *
 * Loading: render `<Spinner color="inherit">` kế thừa `text-*` của button.
 */
import { forwardRef } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import Spinner from '@/shared/ui/feedback/Spinner';

const button = tv(
  {
    slots: {
      base: [
        'inline-flex items-center justify-center cursor-pointer transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      ],
      icon: 'inline-flex items-center justify-center shrink-0',
    },
    variants: {
      // skin = bảng màu. `base` (mặc định) dùng primary/sky brand; `accent` dùng
      // accent/yellow, `danger` dùng red/pink, `neutral` dùng neutral/gray —
      // override ở compoundVariants.
      skin: {
        base: {},
        accent: {},
        danger: {},
        neutral: {},
      },
      variant: {
        // Figma 41:5353: solid bg, KHÔNG gradient, KHÔNG inset shadow.
        primary: {
          base: [
            'border border-primary-6 bg-primary-6 text-neutral-0',
            'hover:bg-primary-7 hover:border-primary-7',
            'active:bg-primary-8 active:border-primary-8',
          ],
        },
        secondary: {
          // Figma: tint 20% + border cùng tone neutral.
          base: [
            'border border-neutral-5 text-fg-4',
            'bg-[color-mix(in_srgb,var(--color-neutral-6)_20%,transparent)]',
            'hover:bg-[color-mix(in_srgb,var(--color-neutral-6)_30%,transparent)]',
            'active:bg-[color-mix(in_srgb,var(--color-neutral-6)_40%,transparent)]',
          ],
        },
        stroke: {
          base: [
            'border border-action-base bg-transparent text-action-base',
            'hover:bg-primary-5/10',
            'active:bg-primary-5/20',
          ],
        },
        ghost: {
          base: [
            'bg-transparent text-action-base',
            'hover:bg-primary-5/10',
            'active:bg-primary-5/20',
          ],
        },
      },
      /**
       * ⛔ MỘT CỔNG DUY NHẤT: `touch:` = MÁY TÍNH BẢNG. ĐỌC TRƯỚC KHI SỬA SỐ NÀO.
       *
       * VÌ SAO CẦN. `defaultVariants` của recipe này là `size: 'xl'` — nghĩa là
       * MỌI `<Button>` không truyền `size` đều ra cỡ LỚN NHẤT: cao 44px, đệm
       * ngang 20px mỗi bên. Trên máy tính bảng nó đọc ra như nút bị phóng to giữa
       * một thanh công cụ toàn chip cao 24px, và vài nút cạnh nhau là tràn hàng
       * (lỗi người dùng báo ở trang Quản lý Camera, có ảnh chụp).
       *
       * ⛔ CHỈ SIẾT, KHÔNG BAO GIỜ NỚI. Đây là nguyên tắc của cả đợt máy tính
       *    bảng: bậc `touch:` chỉ được làm mọi thứ NHỎ LẠI hoặc bằng desktop —
       *    không có con số nào ở đây được lớn hơn con số nền. Người dùng đã bác
       *    hướng "nới cho dễ chạm" vì nó làm giao diện trông như bị phóng to.
       *    Vùng chạm nới bằng lớp `::after` TRONG SUỐT ở từng call-site, không
       *    bằng cách thổi phồng chính cái nút.
       *
       * ĐỆM NGANG SIẾT MẠNH HƠN CHIỀU CAO — cố ý, không phải tuỳ tiện:
       *   • Đệm ngang chỉ tốn CHỖ, không giúp bấm trúng hơn → cắt thoải mái.
       *   • Chiều cao vẫn là thứ giữ nhịp với các hàng kế bên → chỉ hạ một bậc.
       *   `xl` tiết kiệm 24px bề ngang mà chỉ mất 4px chiều cao.
       *
       * ⛔ KHÔNG hạ `xs` — 28px đã là sàn, nó vốn dành cho nút phụ trong bảng dày.
       *
       * ⛔ VÌ SAO KHÔNG DÙNG `max-xl:` (bản trước dùng, đã bỏ):
       *    `max-xl:` khớp theo BỀ RỘNG < 1280px, nên nó bắt luôn CỬA SỔ DESKTOP
       *    THU NHỎ trên laptop/PC — tức là đổi cỡ nút ở nơi không ai yêu cầu, và
       *    vi phạm giao kèo "không đụng tới màn lớn hơn máy tính bảng". Ngược lại
       *    nó lại BỎ SÓT đúng máy tính bảng to nhất: iPad Pro 12.9" nằm ngang cho
       *    viewport ĐÚNG 1366px (≥ 1280) nên `max-xl:` không khớp.
       *    `touch:` (`hover: none` + `pointer: coarse`) khớp CHÍNH XÁC tập thiết
       *    bị cần đổi — mọi iPad ở mọi hướng xoay, và KHÔNG BAO GIỜ khớp trên
       *    PC/laptop dù cửa sổ hẹp đến đâu.
       *
       * Xem `docs/rules/ipad-responsive.md` §1 (bảng viewport), §3.2, §8.1.
       */
      size: {
        xl: {
          base: 'h-11 px-5 py-3 text-body-14-medium gap-2 touch:h-10 touch:px-3.5 touch:gap-1.5',
          icon: 'size-5',
        },
        lg: {
          base: 'h-10 px-4 py-2.5 text-body-14-medium gap-2 touch:h-9 touch:px-3 touch:gap-1.5',
          icon: 'size-5',
        },
        md: {
          base: 'h-9 px-3.5 py-2 text-body-14-medium gap-1.5 touch:h-8 touch:px-2.5',
          icon: 'size-4',
        },
        sm: {
          base: 'h-8 px-3 py-1.5 text-body-14-medium gap-1.5 touch:h-7.5 touch:px-2',
          icon: 'size-4',
        },
        // `xs` GIỮ NGUYÊN — đã ở sàn 28px, hạ nữa là không bấm được.
        xs: { base: 'h-7 px-2 py-1 text-caption-12-medium gap-1', icon: 'size-3' },
      },
      fullWidth: {
        true: { base: 'w-full' },
      },
    },

    compoundVariants: [
      // ── skin=accent (vàng) ─────────────────────────────────────────────────
      // Accent primary: nền vàng sáng → BẮT BUỘC text tối (text-fg-1). Chữ trắng FAIL WCAG.
      {
        skin: 'accent',
        variant: 'primary',
        class: {
          base: [
            'border-accent-5 bg-accent-5 text-fg-1',
            'hover:bg-accent-6 hover:border-accent-6',
            'active:bg-accent-7 active:border-accent-7',
          ],
        },
      },
      {
        skin: 'accent',
        variant: 'secondary',
        class: {
          base: [
            'border-accent-5 text-accent-5',
            'bg-[color-mix(in_srgb,var(--color-accent-5)_20%,transparent)]',
            'hover:bg-[color-mix(in_srgb,var(--color-accent-5)_30%,transparent)]',
            'active:bg-[color-mix(in_srgb,var(--color-accent-5)_40%,transparent)]',
          ],
        },
      },
      {
        skin: 'accent',
        variant: 'stroke',
        class: {
          base: [
            'border-action-accent text-action-accent',
            'hover:bg-accent-5/10',
            'active:bg-accent-5/20',
          ],
        },
      },
      {
        skin: 'accent',
        variant: 'ghost',
        class: {
          base: ['text-action-accent', 'hover:bg-accent-5/10', 'active:bg-accent-5/20'],
        },
      },

      // ── skin=danger (đỏ/hồng) ──────────────────────────────────────────────
      {
        skin: 'danger',
        variant: 'primary',
        class: {
          base: [
            'border-red-6 bg-red-6 text-neutral-0',
            'hover:bg-red-7 hover:border-red-7',
            'active:bg-red-8 active:border-red-8',
          ],
        },
      },
      {
        skin: 'danger',
        variant: 'secondary',
        class: {
          base: [
            'border-red-5 text-red-5',
            'bg-[color-mix(in_srgb,var(--color-red-6)_20%,transparent)]',
            'hover:bg-[color-mix(in_srgb,var(--color-red-6)_30%,transparent)]',
            'active:bg-[color-mix(in_srgb,var(--color-red-6)_40%,transparent)]',
          ],
        },
      },
      {
        skin: 'danger',
        variant: 'stroke',
        class: {
          base: ['border-error text-error', 'hover:bg-error/10', 'active:bg-error/20'],
        },
      },
      {
        skin: 'danger',
        variant: 'ghost',
        class: {
          base: ['text-error', 'hover:bg-error/10', 'active:bg-error/20'],
        },
      },

      // ── skin=neutral (xám) ─────────────────────────────────────────────────
      {
        skin: 'neutral',
        variant: 'primary',
        class: {
          base: [
            'border-neutral-6 bg-neutral-6 text-neutral-0',
            'hover:bg-neutral-7 hover:border-neutral-7',
            'active:bg-neutral-8 active:border-neutral-8',
          ],
        },
      },
      {
        skin: 'neutral',
        variant: 'secondary',
        class: {
          base: [
            'border-neutral-5 text-fg-4',
            'bg-[color-mix(in_srgb,var(--color-neutral-6)_20%,transparent)]',
            'hover:bg-[color-mix(in_srgb,var(--color-neutral-6)_30%,transparent)]',
            'active:bg-[color-mix(in_srgb,var(--color-neutral-6)_40%,transparent)]',
          ],
        },
      },
      {
        skin: 'neutral',
        variant: 'stroke',
        class: {
          // Semantic fg/border tokens — tự flip light/dark.
          base: [
            'border-border-2 text-fg-2',
            'hover:bg-bg-2 hover:border-border-2 hover:text-fg-1',
            'active:bg-bg-3',
          ],
        },
      },
      {
        skin: 'neutral',
        variant: 'ghost',
        class: {
          base: ['text-fg-3', 'hover:bg-bg-2 hover:text-fg-1', 'active:bg-bg-3'],
        },
      },
    ],

    defaultVariants: {
      skin: 'base',
      variant: 'primary',
      size: 'xl',
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

type ButtonVariants = VariantProps<typeof button>;
export type ButtonVariant = NonNullable<ButtonVariants['variant']>;
export type ButtonSkin = NonNullable<ButtonVariants['skin']>;
export type ButtonSize = NonNullable<ButtonVariants['size']>;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariants {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  loading?: boolean;
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      skin,
      variant,
      size,
      fullWidth,
      startIcon,
      endIcon,
      loading = false,
      asChild = false,
      disabled,
      className,
      children,
      /**
       * ⛔ Mặc định `'button'`, KHÔNG phải `'submit'` của HTML.
       *
       * `<button>` nằm trong `<form>` mà không khai `type` thì HTML coi là nút GỬI FORM.
       * Hậu quả: mọi nút phụ trên một màn có form (thu gọn, lọc, thêm dòng, mở popover…)
       * đều submit form khi bấm — form chạy validate và bôi đỏ khắp nơi dù người dùng
       * chưa hề bấm Lưu. Nút nào có `onClick` còn chạy HAI việc một lúc: `onClick` rồi
       * gửi form, nên mutation bị gọi 2 lần.
       *
       * Nút submit thật sự phải khai rõ `type="submit"` (xem `FormActions`).
       */
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const { base, icon } = button({ skin, variant, size, fullWidth });
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        aria-busy={loading || undefined}
        className={base({ className })}
        // `disabled` và `type` chỉ hợp lệ trên <button>; khi asChild child có thể là <a>
        disabled={asChild ? undefined : isDisabled}
        type={asChild ? undefined : type}
        {...props}
      >
        {loading ? (
          <span className={icon()}>
            {/* color="inherit" → spinner kế thừa text-* của button. KHÔNG cần
                spinner color override theo variant. */}
            <Spinner color="inherit" size="sm" />
          </span>
        ) : (
          startIcon && <span className={icon()}>{startIcon}</span>
        )}
        <Slottable>{children}</Slottable>
        {!loading && endIcon && <span className={icon()}>{endIcon}</span>}
      </Comp>
    );
  },
);

Button.displayName = 'Button';

export default Button;
