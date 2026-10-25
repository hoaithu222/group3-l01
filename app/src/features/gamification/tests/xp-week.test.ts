import { groupXpByDay, last7Days, localDateKey, weekWindowStart, weekXpTotal } from '../utils/xp-week';
import type { XpEventLike } from '../utils/xp-week.types';

/**
 * Hàm thuần của khối thống kê Trang chủ. Mọi thời điểm dựng bằng `new Date(y, m, d, h)` (GIỜ ĐỊA PHƯƠNG) rồi `.toISOString()`
 * — nên test đúng ở bất kỳ múi giờ nào của máy chạy: điều cần khoá là "ngày theo đồng hồ máy", không phải một múi giờ cụ thể.
 */

const NOW = new Date(2026, 8, 26, 10, 0); // Thứ Bảy 26/09/2026, 10:00 giờ máy

const at = (dayOfMonth: number, hour: number, month = 8): string =>
  new Date(2026, month, dayOfMonth, hour, 0).toISOString();

const event = (
  dayOfMonth: number,
  hour: number,
  xp: number,
  sourceType: XpEventLike['sourceType'] = 'TASK_COMPLETED',
): XpEventLike => ({ occurredAt: at(dayOfMonth, hour), sourceType, xp });

describe('last7Days', () => {
  it('luôn đủ 7 ngày, cũ → mới, hôm nay ở cuối — ngày trống có xp 0', () => {
    const days = last7Days([], NOW);

    expect(days).toHaveLength(7);
    expect(days.map((d) => d.dateLabel)).toEqual([
      '20/09',
      '21/09',
      '22/09',
      '23/09',
      '24/09',
      '25/09',
      '26/09',
    ]);
    expect(days.map((d) => d.isToday)).toEqual([false, false, false, false, false, false, true]);
    expect(days.every((d) => d.xp === 0 && !d.active && d.events === 0)).toBe(true);
  });

  it('nhãn thứ theo lịch Việt: 26/09/2026 là Thứ Bảy (T7), 20/09 là Chủ nhật (CN)', () => {
    const days = last7Days([], NOW);

    expect(days[0]?.weekday).toBe('CN');
    expect(days[1]?.weekday).toBe('T2');
    expect(days[6]?.weekday).toBe('T7');
  });

  it('cộng XP theo ngày ĐỊA PHƯƠNG: việc lúc 00:30 và 23:30 cùng ngày vào cùng một cột', () => {
    const days = last7Days(
      [event(26, 0, 10), event(26, 23, 5), event(25, 12, 40)],
      new Date(2026, 8, 26, 23, 59),
    );

    expect(days[6]).toMatchObject({ active: true, events: 2, isToday: true, xp: 15 });
    expect(days[5]).toMatchObject({ active: true, events: 1, xp: 40 });
  });

  it('sự kiện chạm trần (xp 0) vẫn là HOẠT ĐỘNG của ngày nhưng không cộng XP', () => {
    const days = last7Days([event(24, 9, 0), event(24, 10, 0)], NOW);

    expect(days[4]).toMatchObject({ active: true, events: 2, xp: 0 });
  });

  it('bỏ qua ADMIN_ADJUST (không phải việc người dùng làm) và sự kiện ngoài cửa sổ', () => {
    const days = last7Days(
      [event(25, 8, -50, 'ADMIN_ADJUST'), event(19, 8, 999), event(27, 8, 999)],
      NOW,
    );

    expect(days.some((d) => d.active)).toBe(false);
    expect(weekXpTotal(days)).toBe(0);
  });

  it('bỏ qua dòng có thời điểm hỏng thay vì làm hỏng cả tuần', () => {
    const days = last7Days(
      [{ occurredAt: 'không-phải-ngày', sourceType: 'TASK_COMPLETED', xp: 30 }, event(26, 9, 20)],
      NOW,
    );

    expect(weekXpTotal(days)).toBe(20);
  });

  it('qua ranh giới tháng: 03/10 lùi 6 ngày là 27/09', () => {
    const days = last7Days([], new Date(2026, 9, 3, 12, 0));

    expect(days[0]?.dateLabel).toBe('27/09');
    expect(days[6]?.dateLabel).toBe('03/10');
  });

  it('qua ranh giới năm: 02/01/2027 lùi 6 ngày là 27/12/2026', () => {
    const days = last7Days([], new Date(2027, 0, 2, 12, 0));

    expect(days[0]?.dateKey).toBe('2026-12-27');
    expect(days[6]?.dateKey).toBe('2027-01-02');
  });
});

describe('groupXpByDay', () => {
  it('chỉ có mặt những ngày CÓ hoạt động, khoá theo giờ địa phương', () => {
    const grouped = groupXpByDay([event(24, 9, 10), event(24, 15, 20)]);

    expect([...grouped.keys()]).toEqual([localDateKey(new Date(2026, 8, 24))]);
    expect(grouped.get('2026-09-24')).toEqual({ events: 2, xp: 30 });
  });
});

describe('weekWindowStart', () => {
  it('là 00:00 địa phương của ngày đầu cửa sổ', () => {
    const start = weekWindowStart(NOW);

    expect(start.getHours()).toBe(0);
    expect(localDateKey(start)).toBe('2026-09-20');
  });
});
