import { STORAGE_WARN_RATIO } from '../constants/resource-limits.constants';
import { formatSize, usagePercent } from './format-size';

export type StorageLevel = 'full' | 'ok' | 'warn';

export interface StorageUsageView {
  level: StorageLevel;
  percent: number;
  remainingBytes: number;
  summary: string;
}

/**
 * `StorageUsageBanner` (README p3-01 §6: OWNER/ADMIN) chỉ hiện từ 90 % hạn mức.
 * `full` (≥ 100 %) đổi tông sang lỗi vì tải lên tiếp theo chắc chắn `413 RSC_007`.
 */
export function describeStorageUsage(usedBytes: number, quotaBytes: number): StorageUsageView {
  const percent = usagePercent(usedBytes, quotaBytes);
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  const level: StorageLevel = ratio >= 1 ? 'full' : ratio >= STORAGE_WARN_RATIO ? 'warn' : 'ok';
  return {
    level,
    percent,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
    summary: `${formatSize(usedBytes)} / ${formatSize(quotaBytes)}`,
  };
}
