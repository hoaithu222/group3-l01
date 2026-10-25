import type { WellbeingLevel } from "./burnout-rules";

/**
 * Ẩn danh hoá số liệu tổng hợp cho admin (p7-03 README §2 "Admin", admin.md §2.1) — HÀM THUẦN. Admin KHÔNG BAO GIỜ thấy dữ liệu một người: mọi con số trả ra phải thuộc một nhóm đủ lớn (k-anonymity).
 *  - tổng số người bật < `anonymityMin` (20) → "chưa đủ dữ liệu", không trả gì;
 *  - số người bật làm tròn tới bội của 10 (không lộ số chính xác, kể cả khi một người bật/tắt);
 *  - ô đếm nhỏ (1..cellMin−1) bị che (`null`); phân bố mức: nhóm < `cellMin` gộp vào "Khác".
 */
export const roundToStep = (n: number, step: number): number => Math.round(n / step) * step;

export const isSufficient = (population: number, anonymityMin: number): boolean => population >= anonymityMin;

/** 0 giữ nguyên (không có gì để che); 1..`cellMin`−1 → `null` (đủ nhỏ để chỉ ra cá nhân). */
export function suppressSmall(count: number, cellMin: number): number | null {
  return count > 0 && count < cellMin ? null : count;
}

export type LevelGroup = WellbeingLevel | "OTHER";
export interface LevelBucket {
  level: LevelGroup;
  count: number;
}

/**
 * Phân bố mức: mỗi nhóm công bố phải ≥ `cellMin` người. Nhóm nhỏ gộp vào `OTHER`; nếu `OTHER` vẫn < `cellMin` thì gộp thêm nhóm nhỏ nhất còn lại (gộp chứ không gán nhầm nhãn). Tổng < `minTotal`
 * (số người ĐÃ được chấm điểm quá ít) → `null`. Tổng các nhóm trả ra luôn bằng tổng đầu vào.
 */
export function groupLevelDistribution(counts: Readonly<Record<WellbeingLevel, number>>, cellMin: number, minTotal: number): LevelBucket[] | null {
  const entries = (["LOW", "MEDIUM", "HIGH"] as const).map((level) => ({ level, count: counts[level] })).filter((e) => e.count > 0);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total === 0 || total < minTotal) return null;

  const kept = entries.filter((e) => e.count >= cellMin).sort((a, b) => a.count - b.count);
  let other = entries.filter((e) => e.count < cellMin).reduce((sum, e) => sum + e.count, 0);
  if (other > 0 && other < cellMin) other += kept.shift()?.count ?? 0;
  if (other > 0 && other < cellMin) return null;

  const out: LevelBucket[] = ["LOW", "MEDIUM", "HIGH"].flatMap((level) => kept.filter((k) => k.level === level).map((k) => ({ level: k.level, count: k.count })));
  if (other > 0) out.push({ level: "OTHER", count: other });
  return out;
}

export interface LatestLevelRow {
  userId: string;
  date: string;
  level: WellbeingLevel;
}

/** Mỗi người MỘT lần (đánh giá mới nhất) rồi đếm theo mức — đầu ra chỉ là SỐ ĐẾM, không giữ lại định danh. */
export function countLatestLevels(rows: readonly LatestLevelRow[]): Record<WellbeingLevel, number> {
  const latest = new Map<string, LatestLevelRow>();
  for (const row of rows) {
    const prev = latest.get(row.userId);
    if (!prev || row.date > prev.date) latest.set(row.userId, row);
  }
  const counts: Record<WellbeingLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const row of latest.values()) counts[row.level] += 1;
  return counts;
}
