import { cn } from '@/shared/utils/style/cn';

/**
 * Heading — semantic h1..h6 + sub-heading sizes with controlled size + light/dark text tone.
 *
 * `size` maps to the HTML tag and visual scale:
 *   extraLarge → h1, large → h2, medium → h3 (default),
 *   small → h4, tiny → h5, extraTiny → h6,
 *   micro → p (14px), nano → p (12px)
 *
 * `light` switches text to the light-neutral tone (default true — suited
 * for kit2 dark UI). Set `light={false}` for a strong dark heading.
 */
export type HeadingSize =
  'extraLarge' | 'large' | 'medium' | 'small' | 'tiny' | 'extraTiny' | 'micro' | 'nano';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';

const SIZE_TO_TAG: Record<HeadingSize, HeadingTag> = {
  extraLarge: 'h1',
  large: 'h2',
  medium: 'h3',
  small: 'h4',
  tiny: 'h5',
  extraTiny: 'h6',
  micro: 'p',
  nano: 'p',
};

// Font tokens from generated-font.css — Figma type scale uses Medium (500) for ALL headings.
// extraLarge → H1, large → H2, medium → H3 (default), small → H4 — match Figma "Heading 1..4".
// tiny / extraTiny render as <h5>/<h6> but use Figma "Body 1/2 - Subhead" tokens
// (18px/16px Medium) since Figma type scale does not define H5/H6.
// micro / nano render as <p> for sub-section headings inside panels (below modal title level).
const SIZE_FONT: Record<HeadingSize, string> = {
  extraLarge: 'text-h1-medium', // 40px / 56px  500  (Heading 1)
  large: 'text-h2-medium', // 32px / 40px  500  (Heading 2)
  medium: 'text-h3-medium', // 24px / 36px  500  (Heading 3)
  small: 'text-h4-medium', // 20px / 32px  500  (Heading 4)
  tiny: 'text-body-18-medium', // 18px / 28px  500  (Body 1 - Subhead 1)
  extraTiny: 'text-body-16-medium', // 16px / 24px  500  (Body 2 - Subhead 2)
  micro: 'text-body-14-medium', // 14px / 20px  500  (panel section header)
  nano: 'text-caption-12-medium', // 12px / 16px  500  (compact section label)
};

// `light=true` (default) maps to the semantic foreground token `fg-1`, which
// flips automatically between light/dark themes. Use `light={false}` to force
// near-black contrast (e.g. for headings rendered on a permanently-light
// surface regardless of the active theme).
const LIGHT_CLASS: Record<string, string> = {
  true: 'text-fg-1',
  false: 'text-fg-5',
};

export interface HeadingProps extends Omit<
  React.HTMLAttributes<HTMLHeadingElement & HTMLParagraphElement>,
  'color'
> {
  size?: HeadingSize;
  light?: boolean;
}

function Heading({ size = 'medium', light = true, className, children, ...rest }: HeadingProps) {
  const Tag = SIZE_TO_TAG[size];
  return (
    <Tag className={cn(SIZE_FONT[size], LIGHT_CLASS[String(light)], className)} {...rest}>
      {children}
    </Tag>
  );
}

export default Heading;
