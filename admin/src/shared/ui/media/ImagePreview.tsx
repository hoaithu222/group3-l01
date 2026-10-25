import { useState } from 'react';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { tv } from 'tailwind-variants';
import ImageLightbox from './ImageLightbox';

/**
 * ImagePreview — thumbnail image with placeholder fallback + optional lightbox.
 *
 * Figma: PMS-NEW node 994-1697.
 * - Has src + loads OK  → displays image (object-cover)
 * - No src / disabled / load error → neutral-7 bg + ImageIcon placeholder
 * - preview=true → click opens ImageLightbox (rotate/zoom viewer)
 *
 * Usage:
 *   <ImagePreview src="https://..." alt="Photo" preview />
 *   <ImagePreview src={url} size="lg" rounded="md" loading="lazy" />
 *   <ImagePreview disabled />
 */

export type ImagePreviewSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ImagePreviewRounded = 'none' | 'sm' | 'md' | 'full';

const styles = tv({
  slots: {
    root: 'relative shrink-0 overflow-hidden',
    placeholder: 'flex size-full items-center justify-center bg-neutral-7',
    image: 'absolute inset-0 size-full max-w-none object-cover',
  },
  variants: {
    size: {
      sm: { root: 'size-8' },
      md: { root: 'size-11' }, // 44px — Figma default
      lg: { root: 'size-16' },
      xl: { root: 'size-20' },
      // Lấp đầy khung cha (viewer/lightbox). BẮT BUỘC có biến thể riêng: các size cố định
      // dùng `size-*`, mà tailwind-merge KHÔNG coi `size-*` xung đột với `w-*`/`h-*` → truyền
      // `className="w-full max-h-[70vh]"` không gỡ được `h-11`, ảnh kẹt trong hộp 44px.
      full: { root: 'size-full shrink' },
    },
    /*
     * Bốn giá trị này từng ánh xạ về '' hết — prop nhận vào, kiểu đúng, và
     * KHÔNG làm gì cả. Bo góc phải đặt trên chính khung ảnh vì `overflow-hidden`
     * của nó mới là thứ cắt được góc của thẻ `<img>` bên trong.
     */
    rounded: {
      none: { root: 'rounded-none' },
      sm: { root: 'rounded-sm' },
      md: { root: 'rounded-md' },
      full: { root: 'rounded-full' },
    },
    interactive: {
      // `focus-visible`: khung là `div role=button` (không phải `<button>`) nên phải tự vẽ vòng focus cho bàn phím.
      true: {
        root: 'cursor-pointer hover:opacity-80 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      },
    },
  },
});

const ICON_SIZE: Record<ImagePreviewSize, number> = {
  sm: 12,
  md: 20,
  lg: 28,
  xl: 32,
  full: 40,
};

export interface ImagePreviewProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'className'
> {
  src?: string;
  alt?: string;
  disabled?: boolean;
  size?: ImagePreviewSize;
  rounded?: ImagePreviewRounded;
  /** When true, clicking the image opens a fullscreen lightbox with rotate/zoom. */
  preview?: boolean;
  /** Custom placeholder when no src / disabled / load error. */
  fallback?: React.ReactNode;
  /** onClick on the container div (ignored when preview=true). */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}

function ImagePreview({
  src,
  alt = '',
  disabled = false,
  size = 'md',
  rounded = 'none',
  preview = false,
  fallback,
  onClick,
  className,
  loading = 'lazy',
  ...imgProps
}: ImagePreviewProps) {
  const [hasError, setHasError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const showPlaceholder = disabled || !src || hasError;
  const isInteractive = !showPlaceholder && (preview || !!onClick);

  const slots = styles({ size, rounded, interactive: isInteractive });

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (showPlaceholder) return;
    if (preview) {
      setLightboxOpen(true);
      return;
    }
    onClick?.(e);
  };

  // Khung tương tác là `div`: thiếu `role`/`tabIndex`/phím thì người dùng bàn phím và trình đọc màn hình không mở được
  // ảnh (Enter/Space phải làm đúng việc của click). `target === currentTarget` để không nuốt phím của phần tử con.
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!isInteractive || e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.currentTarget.click();
  };

  return (
    <>
      <div
        aria-haspopup={isInteractive && preview ? 'dialog' : undefined}
        aria-label={isInteractive && alt ? alt : undefined}
        className={slots.root({ class: className })}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {showPlaceholder ? (
          <div className={slots.placeholder()}>
            {fallback ?? (
              <SystemIcon className="text-fg-4" name="image-outline" size={ICON_SIZE[size]} />
            )}
          </div>
        ) : (
          <img
            alt={alt}
            className={slots.image()}
            loading={loading}
            src={src}
            onError={() => setHasError(true)}
            {...imgProps}
          />
        )}
      </div>

      {/* Lightbox — only rendered when preview=true and src available */}
      {preview && src && !hasError && (
        <ImageLightbox alt={alt} open={lightboxOpen} src={src} onOpenChange={setLightboxOpen} />
      )}
    </>
  );
}

export default ImagePreview;
