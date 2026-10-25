/**
 * Cấp độ THUẦN (p4-03 README §2 / be.md §5.3): `xpForLevel(n) = round(base × n^1.5)` là XP cần để đi từ cấp n lên n+1; ngưỡng tích luỹ
 * `threshold(1) = 0`, `threshold(n) = Σ_{k<n} xpForLevel(k)`. `levelFromXp` tìm nhị phân trên mảng ngưỡng (cache theo `base:maxLevel`),
 * kẹp `maxLevel`. Đổi `base` KHÔNG hạ cấp người đã đạt — việc đó do nơi ghi (`level = max(level, levelFromXp)`), không phải hàm này.
 */
export interface LevelConfig {
  base: number;
  maxLevel: number;
}

export const DEFAULT_LEVEL_CONFIG: LevelConfig = { base: 100, maxLevel: 100 };

export const xpForLevel = (n: number, base: number): number => Math.round(base * Math.pow(n, 1.5));

const cache = new Map<string, number[]>();
const CACHE_MAX = 16;

/** `thresholds(cfg)[i]` = XP tích luỹ tối thiểu để ở cấp `i + 1` (phần tử đầu = 0). Độ dài = `maxLevel`. */
export function thresholds(cfg: LevelConfig): number[] {
  const key = `${cfg.base}:${cfg.maxLevel}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: number[] = [0];
  for (let n = 1; n < cfg.maxLevel; n += 1) out.push(out[n - 1] + xpForLevel(n, cfg.base));
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, out);
  return out;
}

/** Cấp độ ứng với `xp` (≥ 1, ≤ maxLevel). */
export function levelFromXp(xp: number, cfg: LevelConfig): number {
  const t = thresholds(cfg);
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (t[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export interface LevelProgress {
  level: number;
  /** XP đã tích trong cấp hiện tại. */
  xpIntoLevel: number;
  /** XP còn thiếu để lên cấp kế; `0` khi đã ở cấp tối đa. */
  xpToNext: number;
  /** XP cần cho toàn bộ cấp hiện tại (mẫu số thanh tiến độ); `0` khi đã tối đa. */
  levelSpan: number;
}

/** Tiến độ trong cấp cho `level` đã lưu (không hạ cấp) — `level` có thể cao hơn `levelFromXp(xp)` sau khi admin đổi `base`. */
export function levelProgress(xp: number, level: number, cfg: LevelConfig): LevelProgress {
  const t = thresholds(cfg);
  const current = Math.min(Math.max(level, 1), t.length);
  if (current >= t.length) return { level: current, xpIntoLevel: Math.max(0, xp - t[current - 1]), xpToNext: 0, levelSpan: 0 };
  const floor = t[current - 1];
  const next = t[current];
  const into = Math.min(Math.max(0, xp - floor), next - floor);
  return { level: current, xpIntoLevel: into, xpToNext: Math.max(0, next - xp), levelSpan: next - floor };
}

/** Ngưỡng lớn nhất (XP tích luỹ để đạt `maxLevel`) — kiểm cấu hình không tràn Int32 (`GAME_005`). */
export function maxThreshold(cfg: LevelConfig): number {
  const t = thresholds(cfg);
  return t[t.length - 1];
}
