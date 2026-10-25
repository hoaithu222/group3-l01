import { z } from 'zod';

const vi = z.locales.vi();

/**
 * Global Zod locale = Vietnamese.
 * Overrides two common cases for cleaner UX:
 *   - string.min(1) without custom message → "Không được để trống"
 *   - array.min(1)  without custom message → "Bắt buộc chọn ít nhất 1 mục"
 * All other default messages fall through to z.locales.vi().
 * Call this once at app startup (main.tsx) before any schema is parsed.
 */
export function configureZodLocale() {
  z.config({
    localeError: (issue) => {
      if (issue.code === 'too_small' && issue.minimum === 1) {
        if (issue.origin === 'string') return 'Không được để trống';
        if (issue.origin === 'array') return 'Bắt buộc chọn ít nhất 1 mục';
      }
      return vi.localeError(issue);
    },
  });
}
