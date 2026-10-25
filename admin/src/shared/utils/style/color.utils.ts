/**
 * Get computed CSS variable value.
 * Useful when you need a hex color in JS (e.g., for charts, canvas).
 */
export function getCssVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Get hex color from a color token name (e.g., 'primary-5' → '#4096ff') */
export function getThemeColor(tokenName: string): string {
  return getCssVariable(`--color-${tokenName}`);
}
