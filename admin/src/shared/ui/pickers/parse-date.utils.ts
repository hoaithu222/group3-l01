import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/** Common Vietnamese-locale date input formats accepted across kit2 pickers. */
export const COMMON_DATE_FORMATS = [
  'DD/MM/YYYY',
  'D/M/YYYY',
  'DD/MM/YY',
  'D/M/YY',
  'DD-MM-YYYY',
  'D-M-YYYY',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
];

const RANGE_SEPARATOR_RE = /\s*[-–—~→]\s*/;

export interface ParsedDateRange {
  from: Dayjs | null;
  to: Dayjs | null;
}

/** Try parse a single date string. Returns Dayjs if any format matches strictly, else null. */
export function tryParseDate(raw: string, formats: string[] = COMMON_DATE_FORMATS): Dayjs | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  for (const fmt of formats) {
    const d = dayjs(trimmed, fmt, true);
    if (d.isValid()) return d;
  }
  return null;
}

/**
 * Try parse a range string like "20/06/2026 - 30/06/2026". Accepts a single
 * date too. If both ends present but `to` is before `from`, they are swapped.
 */
export function tryParseDateRange(
  raw: string,
  formats: string[] = COMMON_DATE_FORMATS,
): ParsedDateRange | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(RANGE_SEPARATOR_RE).filter(Boolean);
  if (parts.length === 1) {
    const from = tryParseDate(parts[0], formats);
    return from ? { from, to: null } : null;
  }
  if (parts.length === 2) {
    const from = tryParseDate(parts[0], formats);
    const to = tryParseDate(parts[1], formats);
    if (!from && !to) return null;
    if (from && to && to.isBefore(from, 'day')) return { from: to, to: from };
    return { from, to };
  }
  return null;
}
