/**
 * TableEmptyIllustration — Decorative illustration for table/data empty states.
 *
 * Figma: PMS-NEW node 2746-11634
 * Renders a browser window frame containing an empty data-table grid.
 * All structural colors use design-system CSS tokens; `accentColor` controls
 * the window-control dots so the illustration matches contextual accent tones.
 *
 * Usage:
 *   <TableEmptyIllustration />
 *   <TableEmptyIllustration accentColor="sky" width={96} />
 *   <EmptyState illustration={<TableEmptyIllustration accentColor="green" />} title="…" />
 */

import { memo, useId } from 'react';
import { cn } from '@/shared/utils/style/cn';

// ── Accent color axis (window control dots) ───────────────────────────────────

const ACCENT_COLOR_MAP = {
  neutral: 'var(--color-neutral-3)',
  primary: 'var(--color-primary-5)',
  sky: 'var(--color-sky-5)',
  green: 'var(--color-green-5)',
  yellow: 'var(--color-yellow-5)',
  red: 'var(--color-red-5)',
} as const;

export type IllustrationAccentColor = keyof typeof ACCENT_COLOR_MAP;

// ── Structural palette — fixed neutral tokens, follows dark theme ─────────────
// bg     = #475569 (bg-4)    · main window background
// chrome = #334155 (bg-3)    · top bar + sidebar panels
// bar    = #64748B (neutral-5) · address/search bar placeholder
// lines  = #94A3B8 (neutral-4) · table grid lines and outline

const PALETTE = {
  bg: 'var(--color-bg-4)',
  chrome: 'var(--color-bg-3)',
  bar: 'var(--color-neutral-5)',
  lines: 'var(--color-neutral-4)',
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TableEmptyIllustrationProps {
  /** Accent color for the three window-control dots. Default: "neutral" */
  accentColor?: IllustrationAccentColor;
  /** Width in pixels. Default: 118 */
  width?: number;
  /** Height in pixels. Default: 89 */
  height?: number;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const TableEmptyIllustration = memo(
  ({
    accentColor = 'neutral',
    width = 118,
    height = 89,
    className,
  }: TableEmptyIllustrationProps) => {
    // Unique clip-path ID to avoid collisions when rendered multiple times
    const rawId = useId();
    const clipId = `tei-${rawId.replace(/:/g, 'x')}`;

    const dotColor = ACCENT_COLOR_MAP[accentColor];

    return (
      <svg
        aria-hidden
        className={cn(className)}
        fill="none"
        height={height}
        viewBox="0 0 117.87 88.738"
        width={width}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath={`url(#${clipId})`}>
          {/* ── Window background ── */}
          <rect fill={PALETTE.bg} height="88.738" width="117.87" />

          {/* ── Chrome / title-bar ── */}
          <rect fill={PALETTE.chrome} height="8.72069" width="117.869" />

          {/* ── Window-control dots (opacity steps: 100 → 60 → 40 %) ── */}
          <path
            d="M5.29564 5.94856C6.15115 5.94856 6.84427 5.25547 6.84427 4.40719C6.84427 3.54857
             6.15115 2.85547 5.29564 2.85547C4.44115 2.85547 3.74805 3.54857 3.74805 4.40719
             C3.74805 5.25547 4.44115 5.94856 5.29564 5.94856Z"
            fill={dotColor}
          />
          <path
            d="M10.1033 5.94856C10.9588 5.94856 11.6519 5.25547 11.6519 4.40719C11.6519 3.54857
             10.9588 2.85547 10.1033 2.85547C9.24877 2.85547 8.55566 3.54857 8.55566 4.40719
             C8.55566 5.25547 9.24877 5.94856 10.1033 5.94856Z"
            fill={dotColor}
            opacity={0.6}
          />
          <path
            d="M14.992 5.94856C15.8464 5.94856 16.5395 5.25547 16.5395 4.40719C16.5395 3.54857
             15.8464 2.85547 14.992 2.85547C14.1364 2.85547 13.4434 3.54857 13.4434 4.40719
             C13.4434 5.25547 14.1364 5.94856 14.992 5.94856Z"
            fill={dotColor}
            opacity={0.4}
          />

          {/* ── Address / search bar ── */}
          <path
            d="M50.1411 23.7009H10.6984C10.4015 23.7009 10.1035 23.4009 10.1035 23.1112
             V21.2285C10.1035 20.9285 10.4015 20.6284 10.6984 20.6284H50.1411
             C50.438 20.6284 50.7349 20.9285 50.7349 21.2285V23.1112
             C50.6366 23.5043 50.438 23.7009 50.1411 23.7009Z"
            fill={PALETTE.bar}
          />

          {/* ── Left frozen-column sidebar ── */}
          <path d="M30.1228 30.9419H10.1035V76.759H30.1228V30.9419Z" fill={PALETTE.chrome} />

          {/* ── Right frozen-column sidebar ── */}
          <path d="M108.412 30.9419H89.3848V76.759H108.412V30.9419Z" fill={PALETTE.chrome} />

          {/* ── Table outer border ── */}
          <path
            d="M108.412 30.9419V76.759H10.1035V30.9419H108.412Z"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />

          {/* ── Horizontal row dividers ── */}
          <path
            d="M10.4004 39.8691H108.114"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M10.4004 49.1899H108.114"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M10.4004 58.4175H108.114"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M10.4004 67.7388H108.114"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />

          {/* ── Vertical column dividers ── */}
          <path
            d="M30.1213 31.438V76.7586"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M49.843 31.438V76.7586"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M69.6619 31.438V76.7586"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
          <path
            d="M89.3848 31.438V76.7586"
            stroke={PALETTE.lines}
            strokeMiterlimit="10"
            strokeWidth="1.55172"
          />
        </g>

        <defs>
          <clipPath id={clipId}>
            <rect fill="white" height="88.738" width="117.87" />
          </clipPath>
        </defs>
      </svg>
    );
  },
);

TableEmptyIllustration.displayName = 'TableEmptyIllustration';

export default TableEmptyIllustration;
