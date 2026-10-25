import { OVERVIEW_DAY_OPTIONS, OVERVIEW_DEFAULT_DAYS } from '../constants/economy.constants';
import type { EconomyDayPoint } from '../types/economy.types';

/** `?days=` không tin được (URL do người dùng sửa) → chỉ nhận các khoảng đã khai, ngoài ra rơi về mặc định. */
export function parseOverviewDays(raw: string): number {
  const days = Number(raw);
  return OVERVIEW_DAY_OPTIONS.some((o) => Number(o.key) === days) ? days : OVERVIEW_DEFAULT_DAYS;
}

/** Có ít nhất một ngày có phát sinh (BE lấp 0 cho mọi ngày, nên "rỗng" nghĩa là toàn 0) — rỗng thì hiện `EmptyState`, không vẽ đường phẳng. */
export const hasEconomyFlow = (perDay: readonly EconomyDayPoint[]): boolean =>
  perDay.some((d) => d.issued !== 0 || d.spent !== 0 || d.burned !== 0 || d.adjusted !== 0);
