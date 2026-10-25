/**
 * GemIcon — isometric gem-shaped icon container.
 *
 * Figma: PMS-NEW node 469-2502 (Iiius component).
 * 5 color variants × 3 sizes (32 px / 40 px / 56 px) — `xs` là bậc compact cho
 * hàng KPI dày (bảng, strip nhiều cột), `sm` là mặc định theo Figma.
 * Uses actual Figma SVG paths; colors injected via CSS custom properties
 * so they follow the project token system.
 */

import { useId } from 'react';

export type GemColor = 'blue' | 'green' | 'yellow' | 'red' | 'gray';
export type GemSize = 'xs' | 'sm' | 'md'; // 32 px / 40 px / 56 px

// ── Color token mapping (2 levels per color) ─────────────────────────────────
// main  = primary/accent color (darker, more saturated)
// glow  = lighter luminous version used for glow/highlight layers

const COLOR_TOKENS: Record<GemColor, { main: string; glow: string }> = {
  blue: { main: 'var(--color-sky-5)', glow: 'var(--color-sky-4)' },
  green: { main: 'var(--color-green-5)', glow: 'var(--color-green-4)' },
  yellow: { main: 'var(--color-yellow-5)', glow: 'var(--color-yellow-4)' },
  red: { main: 'var(--color-red-5)', glow: 'var(--color-red-4)' },
  gray: { main: 'var(--color-neutral-5)', glow: 'var(--color-neutral-4)' },
};

// Metallic edge highlight — fixed across all color variants (same in Figma for all colors)
const EDGE_COLOR = 'var(--color-sky-3)';

const PX: Record<GemSize, number> = { xs: 32, sm: 40, md: 56 };
const ICON_PX: Record<GemSize, number> = { xs: 16, sm: 20, md: 24 };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GemIconProps {
  color?: GemColor;
  size?: GemSize;
  /** Icon rendered inside the gem. Defaults to children. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

function GemIcon({ color = 'blue', size = 'sm', icon, children, className }: GemIconProps) {
  // useId generates unique IDs per instance — prevents gradient/filter ID collisions
  const rawId = useId();
  const uid = rawId.replace(/:/g, 'g');

  const px = PX[size];
  const iconPx = ICON_PX[size];
  const content = icon ?? children;
  const { main, glow } = COLOR_TOKENS[color];

  // Icon vertical center at 30% of gem height
  // Matches Figma: top-[calc(50%-11px)] + -translate-y-1/2 on a 56px container → center ≈ 17px = 30.4%
  const iconTop = px * 0.3 - iconPx / 2;

  return (
    <div
      className={className}
      style={{ position: 'relative', width: px, height: px, flexShrink: 0 }}
    >
      {/* Gem body — exact Figma SVG paths (node 469-3876, viewBox 56×56) */}
      <svg
        aria-hidden
        fill="none"
        height={px}
        style={{ position: 'absolute', inset: 0 }}
        viewBox="0 0 56 56"
        width={px}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* p0: outer hex outline stroke */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p0`}
            x1="54.3486"
            x2="54.3486"
            y1="39.514"
            y2="21.3375"
          >
            <stop style={{ stopColor: main }} />
            <stop offset="1" stopOpacity={0.2} style={{ stopColor: main }} />
          </linearGradient>

          {/* p1: inner glow stroke (fades in/out at edges) */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p1`}
            x1="2.98074"
            x2="2.98074"
            y1="19.757"
            y2="37.1433"
          >
            <stop stopOpacity={0.01} style={{ stopColor: glow }} />
            <stop offset="0.511626" stopOpacity={0.592} style={{ stopColor: glow }} />
            <stop offset="1" stopOpacity={0.01} style={{ stopColor: glow }} />
          </linearGradient>

          {/* p2: top crystal face (subtle tint, transparent toward top) */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p2`}
            x1="54.3486"
            x2="54.3486"
            y1="33.4239"
            y2="0"
          >
            <stop stopOpacity={0.278} style={{ stopColor: main }} />
            <stop offset="1" stopOpacity={0} style={{ stopColor: main }} />
          </linearGradient>

          {/* p3: right side panel */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p3`}
            x1="55.2321"
            x2="47.7339"
            y1="48.3223"
            y2="30.5727"
          >
            <stop stopOpacity={0.01} style={{ stopColor: glow }} />
            <stop offset="1" style={{ stopColor: main }} />
          </linearGradient>

          {/* p4: left side panel */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p4`}
            x1="10.8874"
            x2="17.505"
            y1="51.194"
            y2="34.1377"
          >
            <stop stopOpacity={0.01} style={{ stopColor: glow }} />
            <stop offset="1" style={{ stopColor: main }} />
          </linearGradient>

          {/* p5: bottom face */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p5`}
            x1="41.7417"
            x2="41.7417"
            y1="55.5623"
            y2="39.4134"
          >
            <stop stopOpacity={0.1} style={{ stopColor: glow }} />
            <stop offset="1" style={{ stopColor: main }} />
          </linearGradient>

          {/* p6: inner gloss band gradient */}
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid}p6`}
            x1="43.2852"
            x2="43.2852"
            y1="36.1901"
            y2="27.1019"
          >
            <stop style={{ stopColor: main }} />
            <stop offset="1" style={{ stopColor: glow }} />
          </linearGradient>

          {/* f0: light edge blur (stdDeviation 0.54) */}
          <filter
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            height="19.5344"
            id={`${uid}f0`}
            width="51.9361"
            x="1.90661"
            y="18.6829"
          >
            <feFlood floodOpacity={0} result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="0.537053" />
          </filter>

          {/* f1: heavy center glow blur (stdDeviation 5.37) */}
          <filter
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            height="30.5704"
            id={`${uid}f1`}
            width="52.6982"
            x="1.32804"
            y="13.5949"
          >
            <feFlood floodOpacity={0} result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="5.37053" />
          </filter>

          {/* f2: inner gloss blur (stdDeviation 1.61) */}
          <filter
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            height="15.5329"
            id={`${uid}f2`}
            width="37.6607"
            x="8.84678"
            y="23.8796"
          >
            <feFlood floodOpacity={0} result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feGaussianBlur result="effect1_foregroundBlur" stdDeviation="1.61116" />
          </filter>

          {/* m0: luminance mask for inner gloss band */}
          <mask
            height="10"
            id={`${uid}m0`}
            maskUnits="userSpaceOnUse"
            style={{ maskType: 'luminance' } as React.CSSProperties}
            width="32"
            x="12"
            y="24"
          >
            <path
              clipRule="evenodd"
              d="M35.4811 33.4242H19.873L12.069 30.031L20.3389 24.3359H35.0152L43.2852 28.88L35.4811 33.4242Z"
              fill="white"
              fillRule="evenodd"
            />
          </mask>
        </defs>

        {/* 1. Outer hex outline stroke */}
        <path
          d="M41.0205 39.2174H14.7285L1.93457 30.4323L15.5156 21.6334L40.2334 21.6334L53.8145 30.4323L41.0205 39.2174Z"
          stroke={`url(#${uid}p0)`}
          strokeWidth="0.592712"
        />

        {/* 2. Glow overlay ring (lightly blurred) */}
        <g filter={`url(#${uid}f0)`}>
          <path
            clipRule="evenodd"
            d="M40.3216 37.1433H15.4277L2.98074 28.4502L16.1708 19.757L39.5785 19.757L52.7686 28.4502L40.3216 37.1433Z"
            fillOpacity={0.3}
            fillRule="evenodd"
            style={{ fill: glow }}
          />
          <path
            d="M40.2598 36.9455H15.4902L3.33301 28.4543L16.2305 19.9543L39.5195 19.9543L52.417 28.4543L40.2598 36.9455Z"
            stroke={`url(#${uid}p1)`}
            strokeWidth="0.395141"
          />
        </g>

        {/* 3. Top crystal face */}
        <path
          clipRule="evenodd"
          d="M35.4807 33.4239H19.8725L12.0685 30.0307L1.43653 0L54.3486 0L43.2847 28.9443L35.4807 33.4239Z"
          fill={`url(#${uid}p2)`}
          fillRule="evenodd"
        />

        {/* 4. Right side panel */}
        <path
          clipRule="evenodd"
          d="M41.3466 39.4132L41.7418 55.2097L54.1714 49.2212V30.5621L41.3466 39.4132Z"
          fill={`url(#${uid}p3)`}
          fillRule="evenodd"
          opacity={0.5}
        />

        {/* 5. Left side panel */}
        <path
          clipRule="evenodd"
          d="M1.4369 30.4259L1.40005 48.4749L14.4766 54.6294L14.4766 39.284L1.4369 30.4259Z"
          fill={`url(#${uid}p4)`}
          fillRule="evenodd"
          opacity={0.5}
        />

        {/* 6. Bottom face */}
        <path
          clipRule="evenodd"
          d="M41.7417 39.4134H14.4769V55.5623H41.7417V39.4134Z"
          fill={`url(#${uid}p5)`}
          fillRule="evenodd"
          opacity={0.5}
        />

        {/* 7. Center glow (heavily blurred — the main luminous area) */}
        <g filter={`url(#${uid}f1)`}>
          <path
            clipRule="evenodd"
            d="M35.4811 33.4242H19.873L12.069 30.031L20.3389 24.3359H35.0152L43.2852 28.88L35.4811 33.4242Z"
            fillRule="evenodd"
            style={{ fill: glow }}
          />
        </g>

        {/* 8. Inner gloss band (masked + lightly blurred) */}
        <g mask={`url(#${uid}m0)`}>
          <g filter={`url(#${uid}f2)`}>
            <path
              clipRule="evenodd"
              d="M35.4811 36.1901H19.873L12.069 31.646L20.3389 27.1019H35.0152L43.2852 31.646L35.4811 36.1901Z"
              fill={`url(#${uid}p6)`}
              fillRule="evenodd"
            />
          </g>
        </g>

        {/* 9. Metallic edge highlights — same across all color variants per Figma */}
        <path
          d="M1.43701 30.5621L1.43701 46.594"
          opacity={0.39}
          stroke={EDGE_COLOR}
          strokeWidth="0.395141"
        />
        <path
          d="M14.4766 39.6018L14.4766 56"
          opacity={0.39}
          stroke={EDGE_COLOR}
          strokeWidth="0.395141"
        />
        <path
          d="M41.3469 38.8116V55.2098"
          opacity={0.39}
          stroke={EDGE_COLOR}
          strokeWidth="0.395141"
        />
        <path
          d="M53.9905 30.1957V46.5939"
          opacity={0.39}
          stroke={EDGE_COLOR}
          strokeWidth="0.395141"
        />
      </svg>

      {/* Icon overlay — positioned at 30% from top (matches Figma placement) */}
      {content && (
        <div
          style={{
            position: 'absolute',
            top: iconTop,
            left: '50%',
            transform: 'translateX(-50%)',
            width: iconPx,
            height: iconPx,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export default GemIcon;
