import { weekFocus, type FocusItem } from '../components/home/week-focus';

/**
 * Hàm thuần `weekFocus` của widget "Giờ tập trung" ở Trang chủ (H2). Thời điểm dựng bằng `new Date(y, m, d, h)` (giờ địa phương)
 * nên đúng ở mọi múi giờ của máy chạy.
 */

const NOW = new Date(2026, 8, 26, 10, 0); // Thứ Bảy 26/09/2026

const joinedAt = (dayOfMonth: number, hour: number): string =>
  new Date(2026, 8, dayOfMonth, hour, 0).toISOString();

const focusItem = (
  dayOfMonth: number,
  hour: number,
  presentSeconds: number,
  cyclesAttended = 2,
): FocusItem => ({ cyclesAttended, joinedAt: joinedAt(dayOfMonth, hour), presentSeconds });

describe('weekFocus', () => {
  it('tổng giây, số vòng, số phiên trong 7 ngày; luôn đủ 7 cột (cũ → mới), ngày trống 0 giây', () => {
    const week = weekFocus(
      [focusItem(26, 9, 1800, 1), focusItem(26, 20, 600, 1), focusItem(24, 8, 3600, 3)],
      NOW,
    );

    expect(week.totalSeconds).toBe(6000);
    expect(week.cycles).toBe(5);
    expect(week.sessions).toBe(3);
    expect(week.days).toHaveLength(7);
    expect(week.days[6]).toMatchObject({ dateLabel: '26/09', isToday: true, seconds: 2400, weekday: 'T7' });
    expect(week.days[4]).toMatchObject({ dateLabel: '24/09', seconds: 3600 });
    expect(week.days[0]).toMatchObject({ dateLabel: '20/09', seconds: 0, weekday: 'CN' });
  });

  it('gom theo ngày ĐỊA PHƯƠNG: buổi học 00:30 sáng thuộc hôm nay chứ không phải hôm qua', () => {
    const week = weekFocus([{ cyclesAttended: 1, joinedAt: joinedAt(26, 0), presentSeconds: 900 }], NOW);

    expect(week.days[6]?.seconds).toBe(900);
    expect(week.days[5]?.seconds).toBe(0);
  });

  it('bỏ lượt ngoài cửa sổ (cũ hơn 7 ngày) và lượt có ngày hỏng', () => {
    const week = weekFocus(
      [
        focusItem(19, 23, 9999),
        { cyclesAttended: 9, joinedAt: 'hỏng', presentSeconds: 9999 },
        focusItem(25, 9, 1200),
      ],
      NOW,
    );

    expect(week.sessions).toBe(1);
    expect(week.totalSeconds).toBe(1200);
  });

  it('không có lượt nào ⇒ sessions 0 (widget dựa vào đây để ẩn)', () => {
    expect(weekFocus([], NOW)).toMatchObject({ cycles: 0, sessions: 0, totalSeconds: 0 });
  });
});
