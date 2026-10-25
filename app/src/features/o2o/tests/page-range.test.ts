import {
  countPrintablePages,
  isPageRangeShapeValid,
  normalizePageRange,
  pageRangeError,
} from '../utils/page-range';

/**
 * Fixture DÙNG CHUNG với BE — chép NGUYÊN bảng của `be/src/modules/o2o/tests/domain/page-range.test.ts` (BE ghi rõ "app chép đúng bảng này").
 * Đổi quy tắc ở một bên phải đổi cả hai. `[range, totalPages, printable | null]`.
 */
const PAGE_RANGE_FIXTURES: [string | null, number, number | null][] = [
  [null, 12, 12],
  ['', 12, 12],
  ['1-3,5', 12, 4],
  [' 1 - 3 , 5 ', 12, 4],
  ['2-4,3-6', 10, 5],
  ['12', 12, 1],
  ['13', 12, null],
  ['5-3', 12, null],
  ['0-2', 12, null],
  ['1-', 12, null],
  ['a-b', 12, null],
  ['1,,2', 12, null],
  ['1-500', 500, 500],
];

describe('page-range — fixture chung BE/app', () => {
  it.each(PAGE_RANGE_FIXTURES)('%p trên %d trang → %p', (range, total, expected) => {
    expect(countPrintablePages(range, total)).toBe(expected);
  });

  it('chuẩn hoá bỏ khoảng trắng; kiểm hình dạng không cần tổng số trang', () => {
    expect(normalizePageRange(' 1 - 3 , 5 ')).toBe('1-3,5');
    expect(isPageRangeShapeValid('1-3,5')).toBe(true);
    expect(isPageRangeShapeValid('3-1')).toBe(false);
    expect(
      isPageRangeShapeValid(Array.from({ length: 21 }, (_, index) => String(index + 1)).join(',')),
    ).toBe(false);
  });

  it('tổng số trang không hợp lệ (chưa đếm xong) → null, không ném lỗi', () => {
    expect(countPrintablePages('1-3', 0)).toBeNull();
    expect(countPrintablePages(null, Number.NaN)).toBeNull();
  });
});

describe('pageRangeError — câu hiện dưới ô nhập', () => {
  it('rỗng → không lỗi; sai hình dạng → nói ví dụ đúng', () => {
    expect(pageRangeError('', 12)).toBeNull();
    expect(pageRangeError('   ', null)).toBeNull();
    expect(pageRangeError('5-3', 12)).toMatch(/Ví dụ đúng: 1-3,5/);
  });

  it('chưa biết tổng số trang thì chỉ báo lỗi hình dạng; biết rồi thì báo vượt trang', () => {
    expect(pageRangeError('1-30', null)).toBeNull();
    expect(pageRangeError('1-30', 12)).toMatch(/vượt quá tổng 12 trang/);
    expect(pageRangeError('1-3,5', 12)).toBeNull();
  });
});
