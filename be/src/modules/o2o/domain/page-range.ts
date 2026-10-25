/**
 * Khoảng trang in "1-3,5,8-10" (p6-05 be.md §3/§5) — hàm THUẦN, dùng chung DTO (kiểm hình dạng) và báo giá (đếm trang in).
 * App giữ bản sao cùng quy tắc ở `app/src/features/o2o/utils/page-range.ts` (fixture khớp `tests/page-range.test.ts`).
 *
 * Quy tắc: số nguyên dương, đoạn `a-b` cần `a ≤ b`, tối đa `PAGE_RANGE_MAX_SEGMENTS` đoạn, mọi trang ≤ tổng số trang; trang trùng
 * giữa các đoạn chỉ tính MỘT lần (in theo thứ tự tăng dần). Chuỗi rỗng/`null` = in toàn bộ.
 */
export const PAGE_RANGE_MAX_LENGTH = 100;
export const PAGE_RANGE_MAX_SEGMENTS = 20;
export const PAGE_RANGE_PATTERN = /^\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*$/;

/** Bỏ khoảng trắng — "1 - 3, 5" ≡ "1-3,5". */
export function normalizePageRange(input: string): string {
  return input.replace(/\s+/g, "");
}

/** Hình dạng hợp lệ (chưa biết tổng số trang) — dùng ở DTO. */
export function isPageRangeShapeValid(input: string): boolean {
  const s = normalizePageRange(input);
  if (s.length === 0 || s.length > PAGE_RANGE_MAX_LENGTH || !PAGE_RANGE_PATTERN.test(s)) return false;
  const segments = s.split(",");
  if (segments.length > PAGE_RANGE_MAX_SEGMENTS) return false;
  return segments.every((seg) => {
    const [a, b] = seg.split("-").map(Number);
    return a >= 1 && (b === undefined || b >= a);
  });
}

/**
 * Số trang sẽ in của `range` với tài liệu `totalPages` trang. `null` = khoảng trang không hợp lệ (sai hình dạng hoặc vượt
 * tổng số trang). `range` rỗng/`null` → toàn bộ `totalPages`.
 */
export function countPrintablePages(range: string | null | undefined, totalPages: number): number | null {
  if (!Number.isInteger(totalPages) || totalPages < 1) return null;
  if (range === null || range === undefined || normalizePageRange(range) === "") return totalPages;
  if (!isPageRangeShapeValid(range)) return null;
  const pages = new Set<number>();
  for (const seg of normalizePageRange(range).split(",")) {
    const [a, b] = seg.split("-").map(Number);
    const end = b ?? a;
    if (end > totalPages) return null;
    for (let p = a; p <= end; p += 1) pages.add(p);
  }
  return pages.size;
}
