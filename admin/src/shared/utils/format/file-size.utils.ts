/**
 * Cỡ tệp và so khớp định dạng — hàm THUẦN, không React, không phụ thuộc kit2.
 *
 * ⛔ Vì sao nằm ở `shared/utils` chứ không ở `shared/ui/media`:
 * `shared/utils/validation/upload-guards.ts` cần hai hàm này. Để chúng trong
 * kit2 thì `utils → ui` thành một phụ thuộc RUNTIME ngược chiều (utils là tầng
 * dưới), và bất kỳ component kit2 nào lỡ import `upload-guards` sẽ đóng thành
 * vòng. Đặt ở đây thì kit2 import LÊN từ utils — đúng chiều, không bao giờ vòng.
 */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** `1536` → `"1.5 KB"`. Số âm / không hữu hạn → `"0 B"`. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1) return '0 B';
  const i = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  const formatted = i === 0 ? value.toFixed(0) : value.toFixed(value < 10 ? 2 : 1);
  return `${parseFloat(formatted)} ${SIZE_UNITS[i]}`;
}

/**
 * Tệp có khớp chuỗi `accept` của `<input type="file">` không.
 *
 * Đỡ cả ba dạng: đuôi (`.pdf`), MIME đầy đủ (`application/pdf`) và MIME có sao
 * (`image/*`). `accept` rỗng ⇒ nhận mọi tệp.
 */
export function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;

  const fileName = file.name.toLowerCase();
  const fileType = (file.type || '').toLowerCase();

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return fileName.endsWith(pattern);
    if (pattern.endsWith('/*')) return fileType.startsWith(pattern.slice(0, -1));
    return fileType === pattern;
  });
}
