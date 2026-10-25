import dayjs from 'dayjs';

import {
  buildSearchParams,
  countActiveFilters,
  EMPTY_FILTERS,
  type SearchFilters,
} from '../utils/search-params';

const withFilters = (patch: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, ...patch });

describe('buildSearchParams — bộ lọc → query của GET …/search', () => {
  it('không lọc gì → chỉ có q (không gửi hasFile/includeThreads thừa)', () => {
    expect(buildSearchParams('đồ án', EMPTY_FILTERS)).toEqual({ q: 'đồ án' });
  });

  it('người gửi → authorId', () => {
    expect(buildSearchParams('a1', withFilters({ author: { id: 'u-1', name: 'An' } }))).toEqual({
      q: 'a1',
      authorId: 'u-1',
    });
  });

  it('khoảng ngày theo GIỜ MÁY: from = đầu ngày, to = cuối ngày (ISO), from ≤ to', () => {
    const start = new Date(2026, 8, 1); // 01/09/2026 (giờ máy)
    const end = new Date(2026, 8, 5);
    const params = buildSearchParams('a1', withFilters({ range: { start, end } }));

    expect(dayjs(params.from).isSame(dayjs(start).startOf('day'))).toBe(true);
    expect(dayjs(params.to).isSame(dayjs(end).endOf('day'))).toBe(true);
    expect(dayjs(params.from).isBefore(dayjs(params.to))).toBe(true);
  });

  it('chọn MỘT ngày (end còn null) = cả ngày đó', () => {
    const day = new Date(2026, 8, 3, 14, 30);
    const params = buildSearchParams('a1', withFilters({ range: { start: day, end: null } }));

    expect(dayjs(params.from).isSame(dayjs(day).startOf('day'))).toBe(true);
    expect(dayjs(params.to).isSame(dayjs(day).endOf('day'))).toBe(true);
  });

  it('đầu/cuối bị đảo thì tự đảo lại (BE trả VAL_001 nếu from > to)', () => {
    const params = buildSearchParams(
      'a1',
      withFilters({ range: { start: new Date(2026, 8, 9), end: new Date(2026, 8, 2) } }),
    );

    expect(dayjs(params.from).isBefore(dayjs(params.to))).toBe(true);
    expect(dayjs(params.from).date()).toBe(2);
  });

  it('"Có tệp" → hasFile=true; loại tệp cụ thể → fileKind (không kèm hasFile)', () => {
    expect(buildSearchParams('a1', withFilters({ file: 'ANY' }))).toEqual({ q: 'a1', hasFile: true });
    expect(buildSearchParams('a1', withFilters({ file: 'IMAGE' }))).toEqual({
      q: 'a1',
      fileKind: 'IMAGE',
    });
  });

  it('includeThreads chỉ gửi khi TẮT (mặc định server là true)', () => {
    expect(buildSearchParams('a1', withFilters({ includeThreads: false })).includeThreads).toBe(false);
    expect(buildSearchParams('a1', EMPTY_FILTERS)).not.toHaveProperty('includeThreads');
  });
});

describe('countActiveFilters', () => {
  it('đếm từng nhóm lọc đang bật', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters(
        withFilters({
          author: { id: 'u', name: 'An' },
          file: 'VIDEO',
          includeThreads: false,
          range: { start: new Date(), end: null },
        }),
      ),
    ).toBe(4);
  });
});
