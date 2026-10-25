import type { ProgressVariant } from '@/shared/ui';
import { formatNumber, percentOf } from '@/shared/utils/format';

import {
  RESOURCE_TYPE_LABELS,
  USAGE_DANGER_PERCENT,
  USAGE_WARNING_PERCENT,
} from '../constants/workspace-resources.constants';

const GIB = 1024 ** 3;

/** Byte → GiB, làm tròn 2 chữ số (hạn mức nhỏ nhất là 0,5 GiB). */
export const bytesToGib = (bytes: number): number => Math.round((bytes / GIB) * 100) / 100;

/** GiB → byte nguyên (BE nhận số nguyên byte). */
export const gibToBytes = (gib: number): number => Math.round(gib * GIB);

/**
 * GiB → chữ theo vi-VN: `100` → "100", `0.5` → "0,5". Hạn mức đi theo bước 0,5 GiB nên tối đa 1 chữ số lẻ;
 * `formatNumber` cố định số chữ số lẻ nên tự chọn 0 hay 1 (cùng cách `formatUsagePercent`). ⛔ KHÔNG gọi
 * `formatNumber(0.5)` trần: mặc định 0 chữ số lẻ làm tròn ra "1" — hạn mức tối thiểu sẽ bị in sai.
 */
export const formatGib = (gib: number): string => formatNumber(gib, Number.isInteger(gib) ? 0 : 1);

/** % đã dùng của hạn mức; `null` khi hạn mức 0/hỏng (không tính được — hiện "—", không nói dối 0%). */
export const usagePercent = (usedBytes: number, quotaBytes: number): number | null =>
  percentOf(usedBytes, quotaBytes, 1);

/** "75%" (số nguyên) hoặc "75,3%"; `null` → "—". Không dùng `formatPercent` vì nó luôn in 1 chữ số lẻ ("75,0%"). */
export const formatUsagePercent = (percent: number | null): string =>
  percent === null ? '—' : `${formatNumber(percent, Number.isInteger(percent) ? 0 : 1)}%`;

/** Màu thanh dung lượng: càng đầy càng đỏ (ngược với `progressVariantOf` — tiến độ càng cao càng tốt). */
export function usageVariantOf(percent: number | null): ProgressVariant {
  if (percent === null) return 'neutral';
  if (percent >= USAGE_DANGER_PERCENT) return 'error';
  if (percent >= USAGE_WARNING_PERCENT) return 'warning';
  return 'primary';
}

export const resourceTypeLabel = (type: string): string => RESOURCE_TYPE_LABELS[type] ?? type;
