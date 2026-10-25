import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { tv } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Avatar — image + name fallback + initials, built on Radix Avatar.
 *
 * Radix handles image loading state for us: while loading or on error,
 * the `Fallback` renders (initials > custom fallback > UserIcon).
 *
 * For stacked groups with overflow chip, see `AvatarGroup`.
 *
 * Usage:
 *   <Avatar src="..." name="Nguyễn Văn A" />
 *   <Avatar name="John Doe" size="lg" />
 */
export type AvatarSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export type AvatarShape = 'circle' | 'square';
/**
 * `auto` — pick a stable background per `name` from the palette (multi-user list look).
 * `brand` — Figma "Boder/100%" gradient (primary-4 → sky-6) cho avatar user duy nhất
 *           (header, profile). KHÔNG bị ảnh hưởng bởi tên — luôn brand cyan.
 */
export type AvatarVariant = 'auto' | 'brand';

// Stable per-name color picked from this palette (initials background).
const BG_PALETTE = [
  'bg-primary-5',
  'bg-blue-5',
  'bg-green-5',
  'bg-yellow-6',
  'bg-purple-5',
  'bg-pink-5',
];

const BRAND_FALLBACK_BG = 'bg-gradient-to-b from-primary-4 to-sky-6';

function getInitials(name: string, maxChars: 1 | 2 = 2): string {
  const parts = name.trim().split(/\s+/).slice(0, maxChars);
  return parts
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function nameToColor(name: string): string {
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return BG_PALETTE[hash % BG_PALETTE.length];
}

const styles = tv(
  {
    slots: {
      root: 'relative inline-flex shrink-0 overflow-hidden',
      // `animate-fade-in`: Radix chỉ mount <img> SAU khi ảnh tải xong, nên trước
      // đó ô avatar hiện initials. Fade 180ms làm bước chuyển initials → ảnh mượt
      // thay vì "nhảy" đột ngột — thấy rõ nhất ở danh sách nhiều avatar.
      image: 'h-full w-full object-cover animate-fade-in',
      fallback:
        'flex h-full w-full items-center justify-center text-neutral-0 select-none leading-none',
    },
    variants: {
      size: {
        // 16x16 — dãy avatar chồng nhau NẰM TRONG một dòng chữ nhỏ (chân luồng).
        // Ở cỡ này avatar chỉ còn là DẤU HIỆU nhận mặt, không phải phần tử bấm
        // được; to hơn là nó át chính dòng chữ nó đang đứng cạnh.
        '3xs': { root: 'size-4', fallback: 'text-[7px] [font-weight:var(--fw-medium,500)]' },
        // 20x20 — avatar phụ cạnh một dòng chữ (hàng danh sách, chip).
        '2xs': { root: 'size-5', fallback: 'text-[8px] [font-weight:var(--fw-medium,500)]' },
        xs: { root: 'size-6', fallback: 'text-[9px] [font-weight:var(--fw-medium,500)]' },
        sm: { root: 'size-8', fallback: 'text-[11px] [font-weight:var(--fw-medium,500)]' },
        // 40x40 + initials 16px / line-height 24px (Figma "Boder/100%").
        md: { root: 'size-10', fallback: 'text-body-16-medium' },
        lg: { root: 'size-12', fallback: 'text-body-16-medium' },
        xl: { root: 'size-16', fallback: 'text-h4-medium' },
        // 128x128 — avatar "hero" cho màn cuộc gọi thoại 1-1 (focus 1 người).
        xxl: { root: 'size-32', fallback: 'text-h1-medium' },
      },
      shape: {
        circle: { root: 'rounded-full' },
        square: { root: 'rounded-none' },
      },
      bordered: {
        true: { root: 'ring-2 ring-primary-5' },
      },
      interactive: {
        true: { root: 'cursor-pointer hover:opacity-80 transition-opacity' },
      },
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  bordered?: boolean;
  /**
   * `auto` (default) — palette-based bg theo tên (multi-user list look).
   * `brand` — gradient primary-4 → sky-6 (Figma "Boder/100%") cho avatar
   *           đơn lẻ trong header / profile.
   */
  variant?: AvatarVariant;
  /**
   * Số ký tự initials rút từ `name`. Default `2` (vd "Nguyễn Văn A" → "NV").
   * Đặt `1` khi chỉ muốn chữ cái đầu (vd avatar header → "N").
   */
  initialsCount?: 1 | 2;
  /** Rendered when no image and no name. Defaults to UserIcon. */
  fallback?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

function Avatar({
  src,
  alt,
  name,
  size = 'md',
  shape = 'circle',
  bordered,
  variant = 'auto',
  initialsCount = 2,
  fallback,
  onClick,
  className,
}: AvatarProps) {
  const slots = styles({ size, shape, bordered, interactive: !!onClick });
  const initials = name ? getInitials(name, initialsCount) : '';
  const bgClass = variant === 'brand' ? BRAND_FALLBACK_BG : name ? nameToColor(name) : 'bg-bg-3';

  return (
    <AvatarPrimitive.Root className={slots.root({ class: className })} onClick={onClick}>
      {src && (
        <AvatarPrimitive.Image alt={alt ?? name ?? 'avatar'} className={slots.image()} src={src} />
      )}
      <AvatarPrimitive.Fallback className={cn(slots.fallback(), bgClass)}>
        {initials || fallback || <SystemIcon className="size-1/2 text-fg-4" name="user-outline" />}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export default Avatar;
