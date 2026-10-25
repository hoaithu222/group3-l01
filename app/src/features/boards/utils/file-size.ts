import { formatFileSize } from '@/shared/utils/format/file-size.utils';

/** "820 KB" / "3,4 MB"; chuỗi rỗng khi chưa biết dung lượng (asset chưa hoàn tất — `size` 0/null). */
export function formatBytes(bytes: number | null | undefined): string {
  // `0` là "chưa biết" ở nguồn dữ liệu này (asset PENDING), không phải "tệp rỗng" — khác `formatFileSize(0)` = "0 B".
  if (!bytes || bytes <= 0) return '';
  return formatFileSize(bytes);
}
