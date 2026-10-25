/**
 * Image (kit2) — renders a system image by registry name.
 *
 * Mirrors the SystemIcon pattern:
 *   - Drop file in `src/assets/image/`
 *   - Run `npm run generate:images`
 *   - Use `<Image name="logo" alt="..." />`
 *
 * Props:
 *   - `name`          Registry key (kebab-case filename stem). Type-safe.
 *   - `alt`           BẮT BUỘC for a11y.
 *   - `preview`       Click image → open ImageLightbox (zoom / rotate).
 *   - `width|height`  px number or any CSS length string.
 *   - `fit`           object-fit: cover · contain · fill · none · scale-down.
 *   - `rounded`       Border radius token: none · sm · md · lg · xl · full.
 *   - `onClick`       Custom click handler (ignored when `preview` is true).
 *
 * Usage:
 *   <Image name="logo" alt="VCI logo" width={120} />
 *   <Image name="pms-logo-icon" alt="PMS" preview rounded="lg" fit="cover" />
 */

import { useState } from 'react';
import { cn } from '@/shared/utils/style/cn';
import ImageLightbox from './ImageLightbox';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { images } from '@/assets/image';
import type { ImageName } from '@/assets/image';

// ── Style maps ─────────────────────────────────────────────────────────────────

const FIT_CLASS = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
  none: 'object-none',
  'scale-down': 'object-scale-down',
} as const;

const ROUNDED_CLASS = {
  none: '',
  sm: '',
  md: '',
  lg: '',
  xl: '',
  full: '',
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImageFit = keyof typeof FIT_CLASS;
export type ImageRounded = keyof typeof ROUNDED_CLASS;

export interface ImageProps {
  /** Registry key — kebab-case filename stem from `src/assets/image/`. */
  name: ImageName;
  /** BẮT BUỘC: alternative text for screen readers. */
  alt: string;

  // ── Sizing ──
  width?: number | string;
  height?: number | string;

  // ── Visual ──
  fit?: ImageFit;
  rounded?: ImageRounded;

  // ── Behavior ──
  /** Click image → open ImageLightbox. */
  preview?: boolean;
  /** Click handler (ignored when `preview` is true). */
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  /** Native `loading` attr. Default `lazy`. */
  loading?: 'eager' | 'lazy';

  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

function Image({
  name,
  alt,
  width,
  height,
  fit = 'cover',
  rounded = 'none',
  preview = false,
  onClick,
  loading = 'lazy',
  className,
}: ImageProps) {
  const [open, setOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const src = images[name];

  if (!src) {
    if (import.meta.env.DEV) {
      console.warn(`[Image] name "${String(name)}" not found. Run \`npm run generate:images\`.`);
    }
    return null;
  }

  const interactive = preview || !!onClick;

  const handleClick: React.MouseEventHandler<HTMLImageElement> = (e) => {
    if (preview) {
      e.stopPropagation();
      setOpen(true);
      return;
    }
    onClick?.(e);
  };

  // Error fallback — placeholder box with image-bold icon
  if (hasError) {
    return (
      <div
        aria-label={alt}
        className={cn(
          'flex items-center justify-center bg-neutral-8 text-fg-4',
          ROUNDED_CLASS[rounded],
          className,
        )}
        role="img"
        style={{ width, height }}
      >
        <SystemIcon name="image-outline" size={24} />
      </div>
    );
  }

  return (
    <>
      <img
        alt={alt}
        className={cn(
          FIT_CLASS[fit],
          ROUNDED_CLASS[rounded],
          interactive && 'cursor-pointer transition-opacity hover:opacity-90',
          className,
        )}
        loading={loading}
        src={src}
        style={{ width, height }}
        onClick={interactive ? handleClick : undefined}
        onError={() => setHasError(true)}
      />

      {preview && <ImageLightbox alt={alt} open={open} src={src} onOpenChange={setOpen} />}
    </>
  );
}

export default Image;
