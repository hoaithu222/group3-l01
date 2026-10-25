/**
 * CardScreenshort — thẻ ảnh / ảnh chụp màn hình có nhiều trục biến thể (kit2).
 *
 * Figma: PMS-NEW node 994-3063.
 *
 *  ┌─────────────┬───────────────────────────────────────────────────────────┐
 *  │ variant     │ "default"  nền pha tone teal (họ BoxInfo)                 │
 *  │             │ "ghost"    trong suốt, chỉ có viền                        │
 *  │             │ "solid"    nền `bg-1` phẳng (lưới thẻ dày)                │
 *  ├─────────────┼───────────────────────────────────────────────────────────┤
 *  │ aspect      │ "square" "4:3" "16:9" "21:9" "auto"                       │
 *  │ size        │ "sm" 160 · "md" 240 · "lg" 320 · "xl" 400 · "full"        │
 *  │ rounded     │ "none" "sm" "md" "lg"                                     │
 *  │ overlay     │ "none" · "gradient" (đỡ chữ) · "solid" (làm mờ cả ảnh)    │
 *  │ captionPos  │ "below" (mặc định) · "overlay" · "none"                   │
 *  └─────────────┴───────────────────────────────────────────────────────────┘
 *
 * Slot mở rộng (ReactNode bất kỳ): `actions` (góc trên phải) · `badge` (góc
 * trên trái) · `footer` (dưới caption) · `placeholder` (khi không có ảnh).
 *
 * ⚠️ `actionIcons[].name` BẮT BUỘC biến thể `-bold` — icon nét mảnh đặt trên
 * ảnh bất kỳ thì mất nét (ép bằng `BoldSystemIconName`).
 *
 * ── Ba lỗi của bản gốc đã sửa khi đưa về base ────────────────────────────────
 *  1. Trục `rounded` khai 4 giá trị nhưng CẢ BỐN đều là chuỗi rỗng: prop nhận
 *     vào, `tsc` xanh, mà bo góc không bao giờ đổi. Nay map sang class thật.
 *  2. Nền `variant="default"` pha từ `nav-from`/`nav-to` — hai token đó là
 *     gradient XANH LÁ của thanh điều hướng, nên thẻ luôn ra nền lục bất kể
 *     tone. Nay pha `teal-5` vào `bg-1`/`bg-2` như `BoxInfo`.
 *  3. `captionPos="overlay"` vẫn dùng `text-fg-1`/`text-fg-3`: ở theme SÁNG hai
 *     token đó gần đen, đặt trên lớp phủ tối là chữ chìm hẳn. Nay chữ trên lớp
 *     phủ chốt sáng cố định (`neutral-0` / `neutral-3`), đúng như docblock gốc
 *     mô tả mà code chưa từng làm.
 */

import { useState } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import ImageLightbox from '@/shared/ui/media/ImageLightbox';

import type { BoldSystemIconName } from './SummaryCard';

// ── Recipe ─────────────────────────────────────────────────────────────────────

const card = tv(
  {
    slots: {
      root: 'relative flex w-full flex-col overflow-hidden',
      media: 'relative w-full overflow-hidden',
      image: 'absolute inset-0 size-full object-cover',
      placeholder: 'absolute inset-0 flex items-center justify-center bg-bg-2',
      overlay: 'pointer-events-none absolute inset-0',
      badge: 'absolute left-3 top-3 z-10 flex items-center gap-2',
      actions: 'absolute right-3 top-3 z-10 flex items-center gap-2',
      captionWrap: 'flex flex-col gap-1 px-4 py-3',
      title: 'truncate text-body-14-medium text-fg-1',
      description: 'truncate text-caption-12 text-fg-3',
      footer: 'border-t border-divider-1 px-4 py-3',
      /**
       * Nút icon nổi TRÊN ẢNH: nền tối + chữ trắng CỐ ĐỊNH, không lật theo theme
       * — ảnh nền có thể sáng hay tối tuỳ tấm, nên nút phải tự cõng nền của nó.
       * Gom vào recipe thay vì viết thẳng trong JSX để mọi nút của thẻ dùng chung
       * một chuỗi (bản gốc lặp chuỗi này ngay trong vòng `map`).
       */
      actionBtn: [
        'flex size-7 shrink-0 cursor-pointer items-center justify-center',
        'border border-divider-1 bg-neutral-10/60 text-neutral-0 backdrop-blur-sm',
        'transition-[background-color,box-shadow,color,border-color] duration-150',
        'hover:border-teal-5/60 hover:bg-neutral-10/85 hover:text-teal-5',
        'hover:shadow-[0_0_8px_color-mix(in_srgb,var(--color-teal-5)_50%,transparent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'disabled:hover:border-divider-1 disabled:hover:bg-neutral-10/60',
        'disabled:hover:text-neutral-0 disabled:hover:shadow-none',
      ],
    },
    variants: {
      variant: {
        default: {
          root: [
            'border-2 border-teal-7/70 bg-bg-1 dark:border-teal-5/40',
            'shadow-[inset_0_0_16px_color-mix(in_srgb,var(--color-teal-5)_5%,transparent)]',
            'transition-[border-color,box-shadow] duration-200',
            'hover:border-teal-6 dark:hover:border-teal-5/70',
          ],
        },
        ghost: {
          root: 'border border-divider-1 bg-transparent transition-colors duration-200 hover:border-teal-5/40',
        },
        solid: {
          root: 'border border-divider-1 bg-bg-1 transition-colors duration-200 hover:border-teal-5/40',
        },
      },
      size: {
        sm: { root: 'max-w-40' }, // 160px
        md: { root: 'max-w-60' }, // 240px
        lg: { root: 'max-w-80' }, // 320px
        xl: { root: 'max-w-100' }, // 400px
        full: { root: 'max-w-none' },
      },
      aspect: {
        square: { media: 'aspect-square' },
        '4:3': { media: 'aspect-[4/3]' },
        '16:9': { media: 'aspect-video' },
        '21:9': { media: 'aspect-[21/9]' },
        auto: { media: 'aspect-auto' },
      },
      /**
       * Bo góc đặt ở ROOT, và root đã `overflow-hidden` nên ảnh bên trong tự bị
       * cắt theo — KHÔNG cần bo lại từng lớp con (bo hai lần là mép ảnh lởm chởm
       * do hai bán kính lệch nhau 1px).
       */
      rounded: {
        none: { root: 'rounded-none' },
        sm: { root: 'rounded-sm' },
        md: { root: 'rounded-md' },
        lg: { root: 'rounded-lg' },
      },
      overlay: {
        none: { overlay: 'hidden' },
        gradient: {
          overlay: 'bg-gradient-to-t from-neutral-10/90 via-neutral-10/40 to-transparent',
        },
        solid: { overlay: 'bg-neutral-10/65' },
      },
      /** Caption đặt ĐÈ lên ảnh → chữ phải sáng cố định, không lật theo theme. */
      captionOnMedia: {
        true: {
          captionWrap: 'absolute inset-x-0 bottom-0 z-10 px-4 pb-3 pt-8',
          title: 'text-neutral-0',
          description: 'text-neutral-3',
        },
      },
      interactive: {
        true: { media: 'cursor-pointer transition-opacity hover:opacity-90' },
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      aspect: '4:3',
      rounded: 'md',
      overlay: 'none',
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

type CardVariants = VariantProps<typeof card>;

// ── Types ──────────────────────────────────────────────────────────────────────

export type CardScreenshortVariant = NonNullable<CardVariants['variant']>;
export type CardScreenshortSize = NonNullable<CardVariants['size']>;
export type CardScreenshortAspect = NonNullable<CardVariants['aspect']>;
export type CardScreenshortRounded = NonNullable<CardVariants['rounded']>;
export type CardScreenshortOverlay = NonNullable<CardVariants['overlay']>;
export type CardScreenshortCaptionPos = 'below' | 'overlay' | 'none';

export interface CardScreenshortActionIcon {
  /** BẮT BUỘC biến thể `-bold` — icon outline chìm trên ảnh. */
  name: BoldSystemIconName;
  /** Nhãn trợ năng (dùng luôn cho tooltip gốc của trình duyệt). */
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

export interface CardScreenshortProps {
  src?: string;
  alt?: string;
  title?: string;
  description?: string;

  variant?: CardScreenshortVariant;
  size?: CardScreenshortSize;
  aspect?: CardScreenshortAspect;
  rounded?: CardScreenshortRounded;
  overlay?: CardScreenshortOverlay;
  /** Vị trí khối tiêu đề/mô tả. Default `below`. */
  captionPos?: CardScreenshortCaptionPos;

  /** Góc trên trái (vd `<Badge>` trạng thái). */
  badge?: React.ReactNode;
  /** Góc trên phải — truyền vào là ĐÈ luôn `actionIcons`. */
  actions?: React.ReactNode;
  /** Nút icon nhanh ở góc trên phải. */
  actionIcons?: CardScreenshortActionIcon[];
  /** Hàng dưới caption (tag, tiến độ, meta…). */
  footer?: React.ReactNode;
  /** Nội dung thay thế khi không có `src` hoặc ảnh lỗi. */
  placeholder?: React.ReactNode;

  /** Bấm vào ảnh → mở `ImageLightbox`. */
  preview?: boolean;
  /** Bấm vào vùng ảnh (bỏ qua khi `preview`). */
  onMediaClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Bấm vào cả thẻ. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;

  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

function CardScreenshort({
  src,
  alt = '',
  title,
  description,
  variant = 'default',
  size = 'md',
  aspect = '4:3',
  rounded = 'md',
  overlay = 'none',
  captionPos = 'below',
  badge,
  actions,
  actionIcons,
  footer,
  placeholder,
  preview = false,
  onMediaClick,
  onClick,
  className,
}: CardScreenshortProps) {
  const [hasError, setHasError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const showPlaceholder = !src || hasError;
  const mediaInteractive = !showPlaceholder && (preview || !!onMediaClick);
  const onMedia = captionPos === 'overlay';

  const slots = card({
    variant,
    size,
    aspect,
    rounded,
    overlay,
    captionOnMedia: onMedia,
    interactive: mediaInteractive,
  });

  const handleMediaClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (showPlaceholder) return;
    if (preview) {
      e.stopPropagation();
      setLightboxOpen(true);
      return;
    }
    onMediaClick?.(e);
  };

  const captionBlock = (title || description) && captionPos !== 'none' && (
    <div className={slots.captionWrap()}>
      {title && <p className={slots.title()}>{title}</p>}
      {description && <p className={slots.description()}>{description}</p>}
    </div>
  );

  return (
    <>
      <div
        className={slots.root({ class: cn(onClick && 'cursor-pointer', className) })}
        style={
          variant === 'default'
            ? {
                backdropFilter: 'blur(5px)',
                background:
                  'linear-gradient(to bottom, color-mix(in srgb, var(--color-teal-5) 7%, var(--color-bg-1)), color-mix(in srgb, var(--color-teal-5) 3%, var(--color-bg-2)))',
              }
            : undefined
        }
        onClick={onClick}
      >
        {/* ── Vùng ảnh ─────────────────────────────────────────────────── */}
        <div className={slots.media()} onClick={handleMediaClick}>
          {showPlaceholder ? (
            <div className={slots.placeholder()}>
              {placeholder ?? <SystemIcon className="text-fg-4" name="image-bold" size={40} />}
            </div>
          ) : (
            <img
              alt={alt}
              className={slots.image()}
              loading="lazy"
              src={src}
              onError={() => setHasError(true)}
            />
          )}

          {/* Lớp phủ tone (ẩn khi overlay="none") */}
          <div aria-hidden className={slots.overlay()} />

          {badge && <div className={slots.badge()}>{badge}</div>}

          {(actions || actionIcons?.length) && (
            // Chặn nổi bọt: bấm nút hành động KHÔNG được mở lightbox / kích
            // hoạt `onClick` của cả thẻ.
            <div className={slots.actions()} onClick={(e) => e.stopPropagation()}>
              {actions ??
                actionIcons?.map((a) => (
                  <button
                    key={a.name + (a.label ?? '')}
                    aria-label={a.label ?? a.name}
                    className={slots.actionBtn()}
                    disabled={a.disabled}
                    title={a.label}
                    type="button"
                    onClick={a.onClick}
                  >
                    <SystemIcon name={a.name} size={14} />
                  </button>
                ))}
            </div>
          )}

          {onMedia && captionBlock}
        </div>

        {captionPos === 'below' && captionBlock}

        {footer && <div className={slots.footer()}>{footer}</div>}
      </div>

      {preview && src && !hasError && (
        <ImageLightbox alt={alt} open={lightboxOpen} src={src} onOpenChange={setLightboxOpen} />
      )}
    </>
  );
}

export default CardScreenshort;
