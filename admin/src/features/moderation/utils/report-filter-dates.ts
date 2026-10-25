import { endOfDay, parseDate, startOfDay, toISOString } from '@/shared/utils/format';

/** Ngày `YYYY-MM-DD` trong URL → mốc ISO đầu/cuối ngày (giờ máy người xem); sai định dạng → bỏ. */
export function dayBoundaryIso(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined;
  const day = parseDate(value);
  if (!day.isValid()) return undefined;
  return toISOString(edge === 'start' ? startOfDay(day) : endOfDay(day));
}

/** Ngày trong URL → `Date` cho `RangeDatePicker`; sai định dạng → `null`. */
export function urlDateToDate(value: string): Date | null {
  const day = value ? parseDate(value) : null;
  return day?.isValid() ? day.toDate() : null;
}
