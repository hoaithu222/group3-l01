import { formatXpCompact, last7Days, markStreakRun } from '../utils/xp-week';
import type { XpEventLike } from '../utils/xp-week.types';

/** Dải chấm chuỗi (`markStreakRun`) và số gọn trên cột (`formatXpCompact`). Thời điểm dựng theo GIỜ ĐỊA PHƯƠNG — đúng ở mọi múi giờ. */

const NOW = new Date(2026, 8, 26, 10, 0); // Thứ Bảy 26/09/2026, 10:00 giờ máy

const event = (dayOfMonth: number, hour: number, xp: number): XpEventLike => ({
  occurredAt: new Date(2026, 8, dayOfMonth, hour, 0).toISOString(),
  sourceType: 'TASK_COMPLETED',
  xp,
});

describe('markStreakRun', () => {
  const empty = last7Days([], NOW);

  it('chuỗi 3 ngày, hôm nay đã hoạt động ⇒ 3 ngày CUỐI được bật', () => {
    const marked = markStreakRun(empty, { streak: 3, streakAtRisk: false });

    expect(marked.map((d) => d.active)).toEqual([false, false, false, false, true, true, true]);
  });

  it('chuỗi 3 ngày nhưng hôm nay CHƯA hoạt động (at risk) ⇒ chuỗi kết thúc ở HÔM QUA', () => {
    const marked = markStreakRun(empty, { streak: 3, streakAtRisk: true });

    expect(marked.map((d) => d.active)).toEqual([false, false, false, true, true, true, false]);
  });

  it('chuỗi dài hơn 7 ngày ⇒ bật đủ 7 chấm, không tràn', () => {
    const marked = markStreakRun(empty, { streak: 30, streakAtRisk: false });

    expect(marked.every((d) => d.active)).toBe(true);
    expect(marked).toHaveLength(7);
  });

  it('chuỗi 0 ⇒ giữ nguyên; và KHÔNG tắt ngày đã có sự kiện', () => {
    const withEvents = last7Days([event(22, 9, 10)], NOW);
    const marked = markStreakRun(withEvents, { streak: 0, streakAtRisk: false });

    expect(marked.map((d) => d.active)).toEqual([false, false, true, false, false, false, false]);
  });
});

describe('formatXpCompact', () => {
  it('dưới 1.000 giữ nguyên; từ 1.000 thành "1,2k" (dấu phẩy, không Intl)', () => {
    expect(formatXpCompact(0)).toBe('0');
    expect(formatXpCompact(999)).toBe('999');
    expect(formatXpCompact(1000)).toBe('1k');
    expect(formatXpCompact(1240)).toBe('1,2k');
    expect(formatXpCompact(12_500)).toBe('12,5k');
  });
});
