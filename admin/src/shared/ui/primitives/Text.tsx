import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/style/cn';
import Tooltip from '@/shared/ui/overlays/Tooltip';

/**
 * Text — inline typography primitive.
 *
 * Renders a `<span>` with controlled `size`, `weight`, `skin`.
 * Font tokens from generated-font.css — changing font.json propagates automatically.
 * For semantic h1..h6 use `Heading`.
 */
export type TextSize =
  | 'extraLarge' // 24px / 36px  → text-h3
  | 'large' // 20px / 32px  → text-h4
  | 'medium' // 16px / 24px  → text-body-16  (default)
  | 'small' // 14px / 20px  → text-body-14
  | 'body' // 13px / 20px  → text-body
  | 'tiny' // 12px / 16px  → text-caption-12
  | 'extraTiny'; // 10px / 16px  → text-caption-10

// Figma type scale ONLY uses Regular (400) and Medium (500).
// `bold` kept for API back-compat but aliases to Medium per design system.
export type TextWeight = 'normal' | 'medium' | 'bold';

export type TextSkin =
  'standard' | 'muted' | 'primary' | 'success' | 'warning' | 'error' | 'disabled';

// Font token class encodes size + lineHeight + weight in one declaration.
// Cannot split via separate font-weight override — font shorthand resets it.
// bold → maps to *-medium (500) because Figma type scale tops out at Medium.
const FONT_TOKEN: Record<TextSize, Record<TextWeight, string>> = {
  extraLarge: { normal: 'text-h3', medium: 'text-h3-medium', bold: 'text-h3-medium' },
  large: { normal: 'text-h4', medium: 'text-h4-medium', bold: 'text-h4-medium' },
  medium: { normal: 'text-body-16', medium: 'text-body-16-medium', bold: 'text-body-16-medium' },
  small: { normal: 'text-body-14', medium: 'text-body-14-medium', bold: 'text-body-14-medium' },
  body: { normal: 'text-body', medium: 'text-body-medium', bold: 'text-body-medium' },
  tiny: {
    normal: 'text-caption-12',
    medium: 'text-caption-12-medium',
    bold: 'text-caption-12-medium',
  },
  extraTiny: {
    normal: 'text-caption-10',
    medium: 'text-caption-10-medium',
    bold: 'text-caption-10-medium',
  },
};

// Skin → semantic color tokens per color-system.md.
// `standard` / `muted` / `disabled` dùng `fg-*` semantic tokens — tự flip giữa
// light/dark mode. Trước đây hardcode `text-neutral-0` (luôn trắng) → vô hình
// trên nền sáng. Component muốn render trên nền cố định tối (vd Header dark
// gradient ở cả 2 mode) → dùng `className="text-fg-on-nav"`.
const SKIN_CLASS: Record<TextSkin, string> = {
  standard: 'text-fg-1',
  muted: 'text-fg-4',
  primary: 'text-link',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  disabled: 'text-fg-5',
};

export interface TextProps extends Omit<React.HTMLAttributes<HTMLElement>, 'color'> {
  as?: React.ElementType;
  size?: TextSize;
  weight?: TextWeight;
  skin?: TextSkin;
  /**
   * Cắt 1 dòng (truncate) + tự hiện tooltip (`title`) khi nội dung BỊ TRÀN.
   * Tooltip mặc định lấy từ `children` khi là chuỗi; hoặc truyền `title` thủ công.
   */
  ellipsis?: boolean;
}

function Text({
  as: Tag = 'span',
  size = 'medium',
  weight = 'normal',
  skin = 'standard',
  ellipsis = false,
  title,
  className,
  children,
  ...rest
}: TextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  // Chỉ theo dõi tràn khi bật ellipsis — so scrollWidth vs clientWidth, cập nhật
  // lại khi đổi kích thước (ResizeObserver) hoặc đổi nội dung.
  useEffect(() => {
    if (!ellipsis) return;
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ellipsis, children]);

  const node = (
    <Tag
      ref={ref}
      className={cn(
        FONT_TOKEN[size][weight],
        SKIN_CLASS[skin],
        ellipsis && 'block truncate',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );

  // Nội dung tooltip: `title` truyền tay ưu tiên; nếu không, lấy `children` khi
  // là chuỗi. Không có nội dung → chỉ truncate, không tooltip.
  const tooltipContent =
    (title as React.ReactNode) ?? (typeof children === 'string' ? children : undefined);

  if (!ellipsis || tooltipContent == null) return node;

  // Dùng kit2 <Tooltip> — chỉ mở khi text BỊ TRÀN (open=false ép đóng khi không
  // tràn; undefined → để Radix tự mở theo hover). Tree luôn bọc Tooltip nên node
  // không remount khi trạng thái tràn đổi → ref/observer ổn định.
  return (
    <Tooltip content={tooltipContent} open={overflowing ? undefined : false}>
      {node}
    </Tooltip>
  );
}

export default Text;
