import { LEVEL_PREVIEW_COUNT } from '../constants/level.constants';

export interface LevelRow {
  level: number;
  /** XP cần để đi từ cấp này lên cấp sau — `round(base × n^1.5)`. */
  toNext: number;
  /** XP tích luỹ tối thiểu để ở cấp này. */
  cumulative: number;
}

/** Cùng công thức `be/src/modules/gamification/services/level.ts` (`xpForLevel`, `thresholds`). */
export function previewRows(base: number, maxLevel: number): LevelRow[] {
  const rows: LevelRow[] = [];
  let cumulative = 0;
  for (let n = 1; n <= Math.min(LEVEL_PREVIEW_COUNT, maxLevel); n += 1) {
    const toNext = Math.round(base * Math.pow(n, 1.5));
    rows.push({ level: n, toNext: n < maxLevel ? toNext : 0, cumulative });
    cumulative += toNext;
  }
  return rows;
}

/** Số nguyên nằm trong `[min, max]` (`null` = ô đang trống ⇒ không hợp lệ). */
export const inRange = (v: number | null, min: number, max: number): v is number =>
  v !== null && Number.isInteger(v) && v >= min && v <= max;
