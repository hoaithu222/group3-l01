import type { InsightsMetric } from '@/core/api/admin';
import { formatNumber } from '@/shared/utils/format';

import type {
  DeltaDirection,
  DeltaGoodWhen,
  DeltaTone,
  MetricDelta,
} from '../types/insights.types';

/** Dấu trừ THẬT (U+2212): ở `tabular-nums` gạch nối `-` ngắn hơn hẳn nên cột số âm/dương so le nhau. */
const MINUS = '−';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * So sánh một chỉ số với kỳ liền trước.
 *
 * - Kỳ trước vắng (`null`) hoặc số hỏng ⇒ `{ pct: null, direction: 'flat' }`: KHÔNG có gì để so, đừng tô ▲▼.
 * - Kỳ trước = 0 ⇒ `pct: null` (không chia cho 0) nhưng `direction` vẫn là `up` nếu kỳ này > 0 — "từ không có thành có" là tin đáng nói.
 * - Phần trăm làm tròn 1 chữ số; làm tròn ra 0 thì coi là `flat` (đừng hiện "▲ 0,0%").
 */
export function computeDelta(metric: InsightsMetric | null | undefined): MetricDelta {
  if (!metric || !isNum(metric.current) || !isNum(metric.previous)) {
    return { pct: null, direction: 'flat' };
  }
  const diff = metric.current - metric.previous;
  if (metric.previous === 0) {
    return { pct: null, direction: diff > 0 ? 'up' : 'flat' };
  }
  const pct = Math.round((diff / Math.abs(metric.previous)) * 1000) / 10;
  if (pct === 0) return { pct: 0, direction: 'flat' };
  return { pct, direction: diff > 0 ? 'up' : 'down' };
}

/**
 * Nhãn của huy hiệu: `+12,5%` · `−3,2%` · `0%`; từ 0 lên có số ⇒ `Mới`; không so sánh được ⇒ `—`.
 */
export function formatDeltaPct(delta: MetricDelta): string {
  if (delta.pct === null) return delta.direction === 'up' ? 'Mới' : '—';
  if (delta.pct === 0) return '0%';
  const abs = Math.abs(delta.pct);
  const sign = delta.pct > 0 ? '+' : MINUS;
  return `${sign}${formatNumber(abs, abs < 10 ? 1 : 0)}%`;
}

/** Số tuyệt đối có dấu cho dòng "Chênh lệch" ở tooltip: `+155` / `−40` / `0`. */
export function formatSignedNumber(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : MINUS}${formatNumber(Math.abs(value))}`;
}

/**
 * Màu huy hiệu theo NGỮ NGHĨA, không theo hướng: chỉ số "tốt khi tăng" thì tăng = xanh, giảm = đỏ; chỉ số "tốt khi giảm" (vd lỗi) thì ngược lại.
 * `flat` luôn trung tính. Tô đỏ một con số đang TĂNG tốt (người dùng mới) là nói ngược với thực tế.
 */
export function deltaTone(direction: DeltaDirection, goodWhen: DeltaGoodWhen = 'up'): DeltaTone {
  if (direction === 'flat') return 'neutral';
  return direction === goodWhen ? 'success' : 'error';
}
