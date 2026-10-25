import { countPrintablePages, isPageRangeShapeValid, normalizePageRange } from "../../domain/page-range";

/**
 * Fixture DÙNG CHUNG với app (`app/src/features/o2o/utils/page-range.ts` + test của nó chép đúng bảng này) — đổi quy tắc ở một bên
 * phải đổi cả hai. `[range, totalPages, printable | null]`.
 */
const PAGE_RANGE_FIXTURES: Array<[string | null, number, number | null]> = [
  [null, 12, 12],
  ["", 12, 12],
  ["1-3,5", 12, 4],
  [" 1 - 3 , 5 ", 12, 4],
  ["2-4,3-6", 10, 5],
  ["12", 12, 1],
  ["13", 12, null],
  ["5-3", 12, null],
  ["0-2", 12, null],
  ["1-", 12, null],
  ["a-b", 12, null],
  ["1,,2", 12, null],
  ["1-500", 500, 500],
];

describe("page-range — fixture chung BE/app", () => {
  it.each(PAGE_RANGE_FIXTURES)("%p trên %d trang → %p", (range, total, expected) => {
    expect(countPrintablePages(range, total)).toBe(expected);
  });

  it("chuẩn hoá bỏ khoảng trắng; kiểm hình dạng không cần tổng số trang", () => {
    expect(normalizePageRange(" 1 - 3 , 5 ")).toBe("1-3,5");
    expect(isPageRangeShapeValid("1-3,5")).toBe(true);
    expect(isPageRangeShapeValid("3-1")).toBe(false);
    expect(isPageRangeShapeValid(Array.from({ length: 21 }, (_, i) => String(i + 1)).join(","))).toBe(false);
  });
});
