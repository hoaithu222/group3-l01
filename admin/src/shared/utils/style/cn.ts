import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import fontTokens from '@/styles/font/font.json';

// Single source of truth: font.json — the exact file scripts/generate-font.mjs
// reads to emit the `text-{scale}` utilities (text-h3, text-body-16, …) in
// generated-font.css. Deriving the token list from it here means any new scale
// added to font.json is recognised automatically, with no second place to edit.
const FONT_TOKEN_BASES = new Set(Object.keys(fontTokens));
// Weight suffixes must mirror `fontWeightSuffix` in scripts/generate-font.mjs.
const FONT_WEIGHT_SUFFIXES = new Set(['medium', 'semibold', 'bold']);

/** Matches the part after `text-`: `h3`, `body-16`, `caption-12-medium`, … */
function isFontToken(value: string): boolean {
  if (FONT_TOKEN_BASES.has(value)) return true;
  const cut = value.lastIndexOf('-');
  return (
    cut !== -1 &&
    FONT_WEIGHT_SUFFIXES.has(value.slice(cut + 1)) &&
    FONT_TOKEN_BASES.has(value.slice(0, cut))
  );
}

// tailwind-merge classifies any unrecognised `text-*` class as a text-COLOR.
// Without this, cn("text-h3", "text-neutral-0") collapses to just the color and
// silently drops the font-size token — making every Heading/Text render at the
// same fallback size. Register the tokens under `font-size` so they conflict
// with each other (last wins) instead of with color utilities.
//
// Exported so `tailwind-variants` recipes (which use their OWN twMerge instance)
// can pass this into their `twMergeConfig`. Without it, a `tv()` slot that
// receives BOTH a font-size token (`text-caption-10-tight-medium`) AND a color
// (`text-yellow-6`) from compound variants silently drops the font-size.
export const twMergeFontExtend = {
  extend: {
    classGroups: {
      'font-size': [{ text: [isFontToken] }],
    },
  },
} as const;

const twMerge = extendTailwindMerge(twMergeFontExtend);

/**
 * Merge Tailwind classes (clsx + tailwind-merge).
 * Dùng thay vì template literals để tránh class conflict.
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-primary-5", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
