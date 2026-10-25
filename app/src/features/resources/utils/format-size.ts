import { formatFileSize } from '@/shared/utils/format/file-size.utils';

/**
 * Dung lượng dễ đọc: `1536` → `1,5 KB`; không biết thì `—`. Logic ở `@/shared/utils/format/file-size.utils` (dấu PHẨY
 * thập phân, bậc 1024, nhãn `KB/MB/GB` — hạn mức "2 GiB" của BE hiển thị thành "2 GB").
 */
export function formatSize(bytes: number | null | undefined): string {
  return formatFileSize(bytes, { fallback: '—' });
}

/** Phần trăm đã dùng, kẹp `0..100`; hạn mức không hợp lệ ⇒ 0 (không chia cho 0). */
export function usagePercent(usedBytes: number, quotaBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(quotaBytes) || quotaBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((usedBytes / quotaBytes) * 100)));
}
