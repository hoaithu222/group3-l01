import {
  ALL_PERIOD,
  isPeriodKey,
  monthLabel,
  periodKindOf,
  periodLabel,
  weekLabel,
  weekRangeText,
} from '../utils/period-labels';

describe('isPeriodKey — query param ?period= là dữ liệu không đáng tin', () => {
  it.each(['ALL', 'M:2026-09', 'M:2026-12', 'W:2026-W37', 'W:2026-W01', 'W:2026-W53'])('%s hợp lệ', (key) => {
    expect(isPeriodKey(key)).toBe(true);
  });

  it.each(['', 'all', '2026-09', 'M:2026-13', 'M:2026-00', 'M:26-09', 'W:2026-W00', 'W:2026-W54', 'W:2026-9', 'Y:2026', 42, null, undefined])(
    '%p không hợp lệ',
    (key) => {
      expect(isPeriodKey(key)).toBe(false);
    },
  );
});

describe('nhãn kỳ', () => {
  it('phân loại kỳ', () => {
    expect(periodKindOf(ALL_PERIOD)).toBe('ALL');
    expect(periodKindOf('M:2026-09')).toBe('MONTH');
    expect(periodKindOf('W:2026-W37')).toBe('WEEK');
  });

  it('tháng: "Tháng 9/2026" (không số 0 đứng đầu)', () => {
    expect(monthLabel('M:2026-09')).toBe('Tháng 9/2026');
    expect(monthLabel('M:2026-12')).toBe('Tháng 12/2026');
  });

  it('tuần ISO: tuần 37/2026 là 07–13/09', () => {
    expect(weekRangeText('W:2026-W37')).toBe('07–13/09');
    expect(weekLabel('W:2026-W37')).toBe('Tuần 37/2026 · 07–13/09');
  });

  it('tuần qua ranh giới tháng/năm ghi đủ hai đầu: tuần 53/2026 = 28/12–03/01, tuần 1/2026 = 29/12–04/01', () => {
    expect(weekRangeText('W:2026-W53')).toBe('28/12–03/01');
    expect(weekRangeText('W:2026-W01')).toBe('29/12–04/01');
  });

  it('periodLabel gom cả ba loại', () => {
    expect(periodLabel('ALL')).toBe('Toàn bộ');
    expect(periodLabel('M:2026-09')).toBe('Tháng 9/2026');
    expect(periodLabel('W:2026-W37')).toBe('Tuần 37/2026 · 07–13/09');
  });
});
