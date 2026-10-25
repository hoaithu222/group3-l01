import { GUEST_DAY_OPTIONS } from '../api';

/** Các mốc ≤ `maxDays` của nhóm; `maxDays` lẻ (vd 45) thì thêm chính nó làm mốc cuối. */
export function buildDayOptions(maxDays: number): number[] {
  const options: number[] = GUEST_DAY_OPTIONS.filter((days) => days <= maxDays);
  if (options[options.length - 1] !== maxDays) options.push(maxDays);
  return options;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Ngày khách hết hạn nếu được mời BÂY GIỜ với `days` ngày — để hiển thị cạnh "N ngày" (app.md p3-04 §7). */
export function expiryAfterDays(days: number, now: number = Date.now()): Date {
  return new Date(now + days * MS_PER_DAY);
}
