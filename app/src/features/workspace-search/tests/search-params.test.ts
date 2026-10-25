import dayjs from 'dayjs';

import {
  buildSearchParams,
  EMPTY_FILTERS,
  parseSearchType,
  supportsFilters,
  type SearchFilters,
} from '../utils/search-params';

/** Thuần: dựng tham số gọi `GET /workspaces/:id/search` từ từ khoá + tab + bộ lọc. Đếm/nhãn bộ lọc: `search-filters.test.ts`. */
const withFilters = (overrides: Partial<SearchFilters>): SearchFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

describe('parseSearchType / supportsFilters', () => {
  it('?type= lạ hoặc thiếu về "messages"; chỉ Tin nhắn và Tệp có bộ lọc', () => {
    expect(parseSearchType('files')).toBe('files');
    expect(parseSearchType('people')).toBe('people');
    expect(parseSearchType('bogus')).toBe('messages');
    expect(parseSearchType(undefined)).toBe('messages');
    expect(supportsFilters('messages')).toBe(true);
    expect(supportsFilters('files')).toBe(true);
    for (const type of ['channels', 'people', 'meetings'] as const)
      expect(supportsFilters(type)).toBe(false);
  });
});

describe('buildSearchParams', () => {
  it('tab không có bộ lọc chỉ gửi { q, type } (thêm tham số thừa chỉ tạo khoá cache khác nhau vô ích)', () => {
    const filters = withFilters({
      hasFile: true,
      includeDirect: true,
      author: { id: 'u-1', name: 'An' },
    });

    expect(buildSearchParams('đồ án', 'channels', filters)).toEqual({
      q: 'đồ án',
      type: 'channels',
    });
    expect(buildSearchParams('đồ án', 'meetings', filters)).toEqual({
      q: 'đồ án',
      type: 'meetings',
    });
  });

  it('includeDirect chỉ gửi khi BẬT (mặc định server là false); hasFile chỉ ở tab Tin nhắn', () => {
    expect(buildSearchParams('ab', 'messages', EMPTY_FILTERS)).toEqual({
      q: 'ab',
      type: 'messages',
    });

    const on = withFilters({ hasFile: true, includeDirect: true });
    expect(buildSearchParams('ab', 'messages', on)).toEqual({
      hasFile: true,
      includeDirect: true,
      q: 'ab',
      type: 'messages',
    });
    expect(buildSearchParams('ab', 'files', on)).toEqual({
      includeDirect: true,
      q: 'ab',
      type: 'files',
    });
  });

  it('phạm vi và người gửi đi CẶP đúng: scopeType + scopeId, authorId', () => {
    const params = buildSearchParams(
      'ab',
      'messages',
      withFilters({
        author: { id: 'u-1', name: 'An' },
        scope: { id: 'ch-1', name: 'chung', type: 'CHANNEL' },
      }),
    );

    expect(params).toMatchObject({ authorId: 'u-1', scopeId: 'ch-1', scopeType: 'CHANNEL' });
  });

  it('khoảng ngày theo GIỜ MÁY: đầu ngày → cuối ngày, đổi sang ISO (không phải nửa đêm UTC)', () => {
    const params = buildSearchParams(
      'ab',
      'messages',
      withFilters({
        range: { start: new Date(2026, 8, 20, 15, 30), end: new Date(2026, 8, 25, 9, 0) },
      }),
    );

    expect(params.from).toBe(
      dayjs(new Date(2026, 8, 20))
        .startOf('day')
        .toISOString(),
    );
    expect(params.to).toBe(
      dayjs(new Date(2026, 8, 25))
        .endOf('day')
        .toISOString(),
    );
    expect(new Date(params.from as string).getHours()).toBe(0);
    expect(new Date(params.to as string).getHours()).toBe(23);
  });

  it('chọn MỘT ngày (end còn null) = cả ngày đó; from > to thì đảo lại (BE trả VAL_001 nếu from > to)', () => {
    const single = buildSearchParams(
      'ab',
      'messages',
      withFilters({ range: { start: new Date(2026, 8, 20, 12), end: null } }),
    );
    expect(new Date(single.from as string).getDate()).toBe(20);
    expect(new Date(single.to as string).getDate()).toBe(20);
    expect(new Date(single.to as string).getTime()).toBeGreaterThan(
      new Date(single.from as string).getTime(),
    );

    const reversed = buildSearchParams(
      'ab',
      'messages',
      withFilters({ range: { start: new Date(2026, 8, 25), end: new Date(2026, 8, 20) } }),
    );
    expect(new Date(reversed.from as string).getTime()).toBeLessThan(
      new Date(reversed.to as string).getTime(),
    );
    expect(new Date(reversed.from as string).getDate()).toBe(20);
  });
});
