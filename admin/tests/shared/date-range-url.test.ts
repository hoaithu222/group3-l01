/**
 * Bộ lọc khoảng ngày sống trên URL (`YYYY-MM-DD`) → mốc ISO gửi API và `Date` cho `RangeDatePicker`.
 */
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { dayBoundaryIso, URL_DATE_FORMAT, urlDateToDate } from '@/shared/utils/format';

describe('dayBoundaryIso', () => {
  it('đầu ngày → 00:00:00.000, cuối ngày → 23:59:59.999 (giờ máy người xem)', () => {
    const start = dayBoundaryIso('2026-09-05', 'start');
    const end = dayBoundaryIso('2026-09-05', 'end');

    expect(start).toBeDefined();
    expect(end).toBeDefined();
    const s = dayjs(start);
    const e = dayjs(end);
    expect(s.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe('2026-09-05 00:00:00.000');
    expect(e.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe('2026-09-05 23:59:59.999');
    // ISO 8601 UTC — dạng BE `z.coerce.date()` nhận.
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rỗng hoặc sai định dạng → undefined (bỏ tham số, không gửi rác)', () => {
    expect(dayBoundaryIso('', 'start')).toBeUndefined();
    expect(dayBoundaryIso('không-phải-ngày', 'end')).toBeUndefined();
  });
});

describe('urlDateToDate', () => {
  it('YYYY-MM-DD → Date đúng ngày; rỗng/sai → null', () => {
    const d = urlDateToDate('2026-09-05');
    expect(d && dayjs(d).format(URL_DATE_FORMAT)).toBe('2026-09-05');
    expect(urlDateToDate('')).toBeNull();
    expect(urlDateToDate('abc')).toBeNull();
  });
});
