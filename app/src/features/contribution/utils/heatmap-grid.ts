import type { HeatmapDay } from '../api/contribution.types';

/** Số tuần hiện trên điện thoại / máy tính bảng (app.md §3). 52 tuần = 364 ngày, còn dưới trần 366 ngày của BE (`CONTRIB_004`). */
export const HEATMAP_WEEKS_PHONE = 26;
export const HEATMAP_WEEKS_TABLET = 52;

/** Mức màu: 0 = không hoạt động, 1–4 = từ ít tới nhiều (theo phân vị của các ngày CÓ hoạt động). */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapRange {
  /** `YYYY-MM-DD` — thứ Hai của tuần đầu tiên. */
  from: string;
  /** `YYYY-MM-DD` — hôm nay theo múi giờ của nhóm. */
  to: string;
}

export interface HeatmapCell {
  date: string;
  /** Ngày sau `to` (phần còn lại của tuần hiện tại) — không vẽ, không chạm được. */
  future: boolean;
  level: HeatLevel;
  total: number;
}

export interface HeatmapColumn {
  cells: HeatmapCell[];
  /** `"Th9"` khi cột này mở đầu một tháng mới (và đủ chỗ, không đè nhãn trước). */
  monthLabel: string | null;
}

const DAY_MS = 86_400_000;
/** Hai nhãn tháng liền nhau phải cách ≥ 3 cột, nếu không "Th9Th10" đè lên nhau ở ô 13dp. */
const MIN_LABEL_GAP = 3;

const dayNumber = (key: string): number => Math.round(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS);

function keyOf(day: number): string {
  const date = new Date(day * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Thứ trong tuần của một số ngày: thứ Hai = 0 … Chủ nhật = 6 (1970-01-01 là thứ Năm). */
const weekdayOfDay = (day: number): number => (((day + 3) % 7) + 7) % 7;

/** `YYYY-MM-DD` → `"15/09"`. */
export const shortDate = (key: string): string => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** Khoảng ngày gọi API: từ thứ Hai của (`weeks` − 1) tuần trước tới hôm nay — luôn bắt đầu thứ Hai để cột đầu đủ 7 ô. */
export function heatmapRange(todayKey: string, weeks: number): HeatmapRange {
  const today = dayNumber(todayKey);
  const mondayThisWeek = today - weekdayOfDay(today);
  return { from: keyOf(mondayThisWeek - (weeks - 1) * 7), to: todayKey };
}

/** Ngưỡng ở phân vị 25/50/75 (hạng gần nhất) của các tổng > 0; rỗng khi chưa có ngày nào hoạt động. */
export function levelThresholds(totals: readonly number[]): [number, number, number] | null {
  const active = totals.filter((total) => total > 0).sort((a, b) => a - b);
  if (active.length === 0) return null;
  const at = (q: number): number => active[Math.max(0, Math.ceil(q * active.length) - 1)] ?? 0;
  return [at(0.25), at(0.5), at(0.75)];
}

export function levelOf(total: number, thresholds: readonly [number, number, number] | null): HeatLevel {
  if (total <= 0 || !thresholds) return 0;
  if (total <= thresholds[0]) return 1;
  if (total <= thresholds[1]) return 2;
  return total <= thresholds[2] ? 3 : 4;
}

/** Giữ nhãn tháng ở cột đổi tháng; nhãn cột 0 nhường cho nhãn ở cột 1–2 (nếu không thì hai nhãn đè nhau và tháng đầu bị đọc sai). */
function keepLabels(candidates: readonly number[]): Set<number> {
  const list = candidates[0] === 0 && (candidates[1] ?? Infinity) < MIN_LABEL_GAP ? candidates.slice(1) : [...candidates];
  const kept: number[] = [];
  for (const column of list) {
    if (kept.length === 0 || column - (kept[kept.length - 1] ?? 0) >= MIN_LABEL_GAP) kept.push(column);
  }
  return new Set(kept);
}

/**
 * Dựng lưới 7 hàng × `weeks` cột (thứ Hai ở trên) từ danh sách ngày server trả. Ngày server không trả (không có bản ghi) → 0 —
 * BE điền đủ cả khoảng nhưng app không tin điều đó để lưới không thủng khi khoảng lệch một ngày do múi giờ.
 */
export function buildHeatmapGrid(range: HeatmapRange, weeks: number, days: readonly HeatmapDay[]): HeatmapColumn[] {
  const byDate = new Map(days.map((day) => [day.date, day.total]));
  const thresholds = levelThresholds(days.filter((day) => day.date >= range.from && day.date <= range.to).map((day) => day.total));
  const start = dayNumber(range.from);
  const columns: HeatmapColumn[] = [];
  const candidates: number[] = [];
  let previousMonth = -1;

  for (let column = 0; column < weeks; column += 1) {
    const cells: HeatmapCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const date = keyOf(start + column * 7 + row);
      const total = byDate.get(date) ?? 0;
      cells.push({ date, future: date > range.to, level: levelOf(total, thresholds), total });
    }
    const month = Number(cells[0]?.date.slice(5, 7));
    if (column === 0 || month !== previousMonth) candidates.push(column);
    previousMonth = month;
    columns.push({ cells, monthLabel: null });
  }

  const labelled = keepLabels(candidates);
  return columns.map((column, index) => ({ ...column, monthLabel: labelled.has(index) ? `Th${Number(column.cells[0]?.date.slice(5, 7))}` : null }));
}

/** "42 ngày có hoạt động trong 26 tuần, nhiều nhất 15/09 (12)" — tóm tắt cho trình đọc màn hình; không có ngày nào thì nói thẳng. */
export function heatmapSummary(days: readonly HeatmapDay[], weeks: number): string {
  const active = days.filter((day) => day.total > 0);
  if (active.length === 0) return `Chưa có hoạt động trong ${weeks} tuần gần nhất`;
  const peak = active.reduce((best, day) => (day.total > best.total ? day : best));
  return `${active.length} ngày có hoạt động trong ${weeks} tuần, nhiều nhất ${shortDate(peak.date)} (${peak.total})`;
}

/** "4 thẻ, 2 bình luận, 1 lượt chấm" — chỉ liệt kê loại có số > 0. */
export function dayPartsText(day: HeatmapDay): string {
  return [
    day.task > 0 ? `${day.task} thẻ` : null,
    day.checklist > 0 ? `${day.checklist} mục việc` : null,
    day.comment > 0 ? `${day.comment} bình luận` : null,
    day.review > 0 ? `${day.review} lượt chấm` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
}

/** "15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)" — hoặc "15/09: không có hoạt động". */
export function dayDetailText(date: string, day: HeatmapDay | undefined): string {
  if (!day || day.total <= 0) return `${shortDate(date)}: không có hoạt động`;
  return `${shortDate(date)}: ${day.total} hoạt động (${dayPartsText(day)})`;
}

/** `YYYY-MM-DD` → `"15/09/2026"`. */
export const fullDate = (key: string): string => `${shortDate(key)}/${key.slice(0, 4)}`;

/** Các ngày CÓ hoạt động, mới → cũ — bản danh sách chữ thay cho lưới màu. */
export function activeDaysNewestFirst(days: readonly HeatmapDay[]): HeatmapDay[] {
  return days.filter((day) => day.total > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}
