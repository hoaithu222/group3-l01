/** Convert px to rem (base 16px) */
export function pxToRem(px: number): number {
  return px / 16;
}

/** Convert px to rem string */
export function pxToRemString(px: number): string {
  return `${pxToRem(px)}rem`;
}

/** Tailwind spacing to px (spacing * 4) */
export function tailwindSpacingToPx(space: number): number {
  return space * 4;
}
