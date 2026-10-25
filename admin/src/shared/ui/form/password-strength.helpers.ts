/**
 * Helpers + types for the <PasswordStrength /> component.
 *
 * Lives in its own file so `PasswordStrength.tsx` can export ONLY a React
 * component — required by the `react-refresh/only-export-components` ESLint
 * rule (Vite SWC fast refresh otherwise tears down the module on every save).
 */

export interface PasswordCondition {
  label: string;
  test: (value: string) => boolean;
}

export type PasswordStrengthLevel = 'empty' | 'weak' | 'moderate' | 'strong';

export const DEFAULT_PASSWORD_CONDITIONS: PasswordCondition[] = [
  { label: 'Ít nhất 1 chữ in hoa', test: (v) => /[A-Z]/.test(v) },
  { label: 'Ít nhất 1 chữ số', test: (v) => /\d/.test(v) },
  { label: 'Ít nhất 8 ký tự', test: (v) => v.length >= 8 },
];

/** Maps number of passed conditions (out of 3) to strength level. */
export function getPasswordLevel(passed: number): PasswordStrengthLevel {
  if (passed <= 0) return 'empty';
  if (passed === 1) return 'weak';
  if (passed === 2) return 'moderate';
  return 'strong';
}
