import { O2O_LIMITS } from '../constants/o2o.constants';

/**
 * Khoảng trang in "1-3,5,8-10" — BẢN SAO có chủ ý của `be/src/modules/o2o/domain/page-range.ts` (BE không có gói dùng chung với app).
 * Fixture ở `tests/page-range.test.ts` chép NGUYÊN bảng của `be/.../tests/domain/page-range.test.ts` — đổi quy tắc một bên phải đổi cả hai.
 *
 * Quy tắc: số nguyên dương; đoạn `a-b` cần `a ≤ b`; tối đa 20 đoạn; mọi trang ≤ tổng số trang; trang trùng giữa các đoạn chỉ tính
 * MỘT lần; chuỗi rỗng/`null` = in toàn bộ. Kiểm ở app để báo lỗi ngay dưới ô nhập, KHÔNG thay cho BE (`O2O_012` vẫn là câu chốt).
 */
const PATTERN = /^\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*$/;

/** Bỏ khoảng trắng — "1 - 3, 5" ≡ "1-3,5". */
export function normalizePageRange(input: string): string {
  return input.replace(/\s+/g, '');
}

/** Hình dạng hợp lệ (chưa biết tổng số trang). */
export function isPageRangeShapeValid(input: string): boolean {
  const text = normalizePageRange(input);
  if (text.length === 0 || text.length > O2O_LIMITS.pageRangeMaxLength || !PATTERN.test(text)) {
    return false;
  }
  const segments = text.split(',');
  if (segments.length > O2O_LIMITS.pageRangeMaxSegments) return false;
  return segments.every((segment) => {
    const [from = 0, to] = segment.split('-').map(Number);
    return from >= 1 && (to === undefined || to >= from);
  });
}

/**
 * Số trang sẽ in. `null` = khoảng trang không hợp lệ (sai hình dạng, hoặc vượt tổng số trang). `range` rỗng/`null` → toàn bộ.
 */
export function countPrintablePages(
  range: string | null | undefined,
  totalPages: number,
): number | null {
  if (!Number.isInteger(totalPages) || totalPages < 1) return null;
  if (range === null || range === undefined || normalizePageRange(range) === '') return totalPages;
  if (!isPageRangeShapeValid(range)) return null;

  const pages = new Set<number>();
  for (const segment of normalizePageRange(range).split(',')) {
    const [from = 0, to] = segment.split('-').map(Number);
    const end = to ?? from;
    if (end > totalPages) return null;
    for (let page = from; page <= end; page += 1) pages.add(page);
  }
  return pages.size;
}

/**
 * Lỗi của ô khoảng trang để hiện DƯỚI ô, hoặc `null` khi ổn. Chưa biết tổng số trang thì chỉ báo lỗi hình dạng.
 * Câu chữ khớp `O2O_012` để người dùng gặp cùng một thông điệp dù lỗi bắt ở app hay ở server.
 */
export function pageRangeError(range: string, totalPages: number | null): string | null {
  if (normalizePageRange(range) === '') return null;
  const invalid = 'Khoảng trang không hợp lệ. Ví dụ đúng: 1-3,5';
  if (!isPageRangeShapeValid(range)) return invalid;
  if (totalPages !== null && countPrintablePages(range, totalPages) === null) {
    return `Có trang vượt quá tổng ${totalPages} trang của tệp`;
  }
  return null;
}
