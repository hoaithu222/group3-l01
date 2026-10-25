import { formatNumber } from './currency.utils';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export interface FormatFileSizeOptions {
  /**
   * Trả về khi dung lượng không dùng được (`null`, `undefined`, âm, `NaN`).
   * ⚠️ Mặc định là CHUỖI RỖNG: chỗ nào cần dấu gạch (`'—'`) thì truyền vào — đừng bịa `0 B`, đó là lời khẳng định
   * "tệp rỗng" cho một tệp mà ta chỉ đơn giản là chưa biết dung lượng.
   */
  fallback?: string;
}

/**
 * Dung lượng dễ đọc: `1536` → `1,5 KB`, `1048576` → `1 MB`.
 *
 * Dấu PHẨY thập phân đúng quy ước Việt Nam (cùng lý do `formatCurrency` dùng dấu chấm ngăn nghìn — xem
 * `currency.utils.ts`); đi qua `formatNumber` chứ không `toFixed(1)` (ra `1.5` — dấu chấm, người Việt đọc là
 * "một nghìn năm trăm"), càng không `toLocaleString`: Hermes cắt ICU nên hai máy ra hai kiểu.
 *
 * Bậc 1024 (KiB…) nhưng nhãn `KB/MB/GB` — cách người dùng vẫn gọi trên điện thoại. Không hiện ",0" (`2 GB`, không
 * `2,0 GB`); từ 100 trở lên bỏ phần lẻ (`128 MB`).
 *
 * ⛔ Trước đây MỖI feature tự viết một bản (boards, chat, conversations, resources, workspace-search) — và ba bản
 * trong số đó dùng `toFixed(1)` nên ra `3.4 MB` trong khi hai bản kia ra `3,4 MB`: cùng một tệp hiện hai kiểu trên hai
 * màn. Feature không import chéo nhau được, nên chỗ đúng của hàm này là `shared`.
 */
export function formatFileSize(
  bytes: number | null | undefined,
  { fallback = '' }: FormatFileSizeOptions = {},
): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return fallback;

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return formatNumber(Math.round(value), { unit: 'B' });

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return formatNumber(rounded, { decimals: Number.isInteger(rounded) ? 0 : 1, unit: UNITS[unit] });
}
