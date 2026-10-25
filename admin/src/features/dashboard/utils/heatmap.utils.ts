import type { InsightsHeatmap } from '@/core/api/admin';
import { formatNumber } from '@/shared/utils/format';

import { HEATMAP_DAYS, HEATMAP_HOURS, WEEKDAY_FULL, type HeatLevel } from '../constants/heatmap.constants';

/** Hàm THUẦN của bản đồ nhiệt thứ × giờ: giá trị ô, ô cao điểm, mức màu, chuỗi mô tả. */

export interface HeatCell {
  /** 0 = Thứ Hai … 6 = Chủ nhật. */
  day: number;
  /** 0–23. */
  hour: number;
  value: number;
}

/** Giá trị một ô; thiếu hàng/cột hoặc không phải số dương hữu hạn → 0 (BE trả sai kích thước thì không vỡ lưới). */
export function cellValue(cells: InsightsHeatmap['cells'], day: number, hour: number): number {
  const value = cells[day]?.[hour];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Ô đông nhất. Tính lại từ `cells` chứ KHÔNG tin `heatmap.max` — hai thứ lệch nhau (cache, BE đổi) thì dòng tóm tắt và thang màu
 * cùng sai. Hoà thì lấy ô ĐẦU tiên (quét theo thứ rồi giờ). Không có ô nào > 0 → `null`.
 */
export function peakCell(heatmap: InsightsHeatmap): HeatCell | null {
  let best: HeatCell | null = null;
  for (let day = 0; day < HEATMAP_DAYS; day += 1) {
    for (let hour = 0; hour < HEATMAP_HOURS; hour += 1) {
      const value = cellValue(heatmap.cells, day, hour);
      if (value > 0 && (best === null || value > best.value)) best = { day, hour, value };
    }
  }
  return best;
}

/** Mức màu 0–4: 0 = không có gì, còn lại chia tuyến tính theo tỉ lệ so với ô đông nhất (≤25% → 1 … >75% → 4). */
export function heatLevel(value: number, max: number): HeatLevel {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatLevel;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "Thứ Ba · 14:00–15:00 · 1.234 tin" — dòng chi tiết một ô. */
export function formatHeatCell(day: number, hour: number, value: number): string {
  return `${WEEKDAY_FULL[day] ?? ''} · ${pad2(hour)}:00–${pad2(hour + 1)}:00 · ${formatNumber(value)} tin`;
}

/** "Thứ Ba lúc 14h" — phần tên cao điểm của dòng tóm tắt. */
export function formatPeakWhen(peak: HeatCell): string {
  return `${WEEKDAY_FULL[peak.day] ?? ''} lúc ${peak.hour}h`;
}
