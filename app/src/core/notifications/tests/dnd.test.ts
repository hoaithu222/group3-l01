import { computeDndUntil } from '../dnd';

/**
 * `dndUntil` phải ở TƯƠNG LAI (BE trả `NOTI_004` nếu không) và ở dạng ISO UTC (`z.string().datetime()` chỉ nhận
 * hậu tố `Z`).
 */
describe('computeDndUntil', () => {
  const now = new Date(2026, 8, 21, 14, 30, 0); // 21/09/2026 14:30 giờ máy

  it('1 giờ → đúng +1 giờ', () => {
    expect(new Date(computeDndUntil('one-hour', now)).getTime()).toBe(now.getTime() + 3_600_000);
  });

  it('8 giờ → đúng +8 giờ', () => {
    expect(new Date(computeDndUntil('eight-hours', now)).getTime()).toBe(
      now.getTime() + 8 * 3_600_000,
    );
  });

  it('đến sáng mai → 07:00 giờ máy ngày kế tiếp', () => {
    const until = new Date(computeDndUntil('until-morning', now));
    expect(until.getFullYear()).toBe(2026);
    expect(until.getMonth()).toBe(8);
    expect(until.getDate()).toBe(22);
    expect(until.getHours()).toBe(7);
    expect(until.getMinutes()).toBe(0);
  });

  it('đến sáng mai lúc 02:00 sáng vẫn là 07:00 NGÀY KẾ TIẾP, không phải 5 tiếng nữa', () => {
    const lateNight = new Date(2026, 8, 21, 2, 0, 0);
    const until = new Date(computeDndUntil('until-morning', lateNight));
    expect(until.getDate()).toBe(22);
    expect(until.getHours()).toBe(7);
  });

  it('qua cuối tháng', () => {
    const endOfMonth = new Date(2026, 8, 30, 23, 0, 0);
    const until = new Date(computeDndUntil('until-morning', endOfMonth));
    expect(until.getMonth()).toBe(9);
    expect(until.getDate()).toBe(1);
  });

  it('luôn ở tương lai và có hậu tố Z', () => {
    for (const duration of ['one-hour', 'eight-hours', 'until-morning'] as const) {
      const iso = computeDndUntil(duration, now);
      expect(iso.endsWith('Z')).toBe(true);
      expect(new Date(iso).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
