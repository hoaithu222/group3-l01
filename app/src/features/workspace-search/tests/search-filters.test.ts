import { activeFilterLabels, formatDateRangeLabel } from '../utils/filter-labels';
import { countActiveFilters, EMPTY_FILTERS, type SearchFilters } from '../utils/search-params';

/** Thuần: đếm bộ lọc đang bật theo tab và dựng nhãn chip cho từng bộ lọc. Dựng tham số gọi API: `search-params.test.ts`. */
const withFilters = (overrides: Partial<SearchFilters>): SearchFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

describe('countActiveFilters / activeFilterLabels', () => {
  it('đếm từng bộ lọc; hasFile chỉ tính ở tab Tin nhắn (sang Tệp nó không tác dụng)', () => {
    const filters = withFilters({
      author: { id: 'u-1', name: 'An' },
      hasFile: true,
      includeDirect: true,
      range: { start: new Date(2026, 8, 1), end: null },
      scope: { id: 'ch-1', name: 'chung', type: 'CHANNEL' },
    });

    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(filters)).toBe(5);
    expect(countActiveFilters(filters, 'files')).toBe(4);
    expect(activeFilterLabels(filters, 'files').map((item) => item.key)).toEqual([
      'author',
      'range',
      'scope',
      'direct',
    ]);
    expect(activeFilterLabels(filters, 'messages').map((item) => item.key)).toEqual([
      'author',
      'range',
      'scope',
      'hasFile',
      'direct',
    ]);
  });

  it('nhãn: người gửi, khoảng ngày một ngày/nhiều ngày, phạm vi kênh có # còn nhóm chat không có', () => {
    expect(formatDateRangeLabel({ start: new Date(2026, 8, 20), end: null })).toBe('20/09/2026');
    expect(formatDateRangeLabel({ start: new Date(2026, 8, 20), end: new Date(2026, 8, 25) })).toBe(
      '20/09/2026 – 25/09/2026',
    );

    const labels = activeFilterLabels(
      withFilters({
        author: { id: 'u-1', name: 'An' },
        scope: { id: 'cv-1', name: 'Nhóm học tập', type: 'CONVERSATION' },
      }),
      'messages',
    );
    expect(labels).toEqual([
      { key: 'author', label: 'Người gửi: An' },
      { key: 'scope', label: 'Trong Nhóm học tập' },
    ]);
  });
});
