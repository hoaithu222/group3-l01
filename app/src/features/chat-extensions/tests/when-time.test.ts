import dayjs from 'dayjs';

import { checkWhen, combineDateAndTime, daysToMs, formatDeadline, formatWhen } from '../utils/local-time';
import { buildPresets } from '../utils/when-presets';

const WINDOW = { maxMs: daysToMs(30), minLeadMs: 60_000 };

/** Mốc theo GIỜ MÁY (test không phụ thuộc múi giờ của máy chạy). */
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('checkWhen — cùng luật `isWithinWindow` của BE', () => {
  const now = local(2026, 9, 27, 10, 0);

  it('sát biên: 59 giây → lỗi; đúng 60 giây → hợp lệ', () => {
    expect(checkWhen(new Date(now + 59_000), now, WINDOW, 'Thời điểm gửi')).toMatch(/^Thời điểm gửi phải sau ít nhất 1 phút/);
    expect(checkWhen(new Date(now + 60_000), now, WINDOW, 'Thời điểm gửi')).toBeNull();
  });

  it('xa quá cửa sổ → lỗi nói rõ số ngày; đúng biên trên → hợp lệ', () => {
    expect(checkWhen(new Date(now + WINDOW.maxMs + 1), now, WINDOW, 'Thời điểm gửi')).toBe('Thời điểm gửi chỉ trong vòng 30 ngày tới');
    expect(checkWhen(new Date(now + WINDOW.maxMs), now, WINDOW, 'Thời điểm gửi')).toBeNull();
  });

  it('ngày không hợp lệ → câu lỗi thay vì ném', () => {
    expect(checkWhen(new Date('x'), now, WINDOW, 'Thời điểm gửi')).toBe('Thời điểm không hợp lệ');
  });
});

describe('combineDateAndTime / định dạng giờ máy', () => {
  it('ghép ngày + HH:mm theo giờ máy; sai định dạng/ngoài khoảng → null', () => {
    const at = combineDateAndTime(new Date(2026, 8, 21, 3, 33), '20:05');
    expect(dayjs(at).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-09-21 20:05:00');
    expect(combineDateAndTime(new Date(), '25:00')).toBeNull();
    expect(combineDateAndTime(new Date(), '9h')).toBeNull();
  });

  it('formatWhen: "20:00 Thứ hai 21/09" (tên thứ tự dựng, không qua Intl); formatDeadline: "20:00 21/09"', () => {
    const at = new Date(2026, 8, 21, 20, 0); // 21/09/2026 là Thứ hai
    expect(formatWhen(at)).toBe('20:00 Thứ hai 21/09');
    expect(formatDeadline(at)).toBe('20:00 21/09');
    expect(formatWhen('không phải ngày')).toBe('');
  });
});

describe('buildPresets — gợi ý nhanh', () => {
  it('hẹn giờ: 10:00 Thứ bảy → đủ 4 gợi ý, Thứ Hai tới là 08:00 ngày 28/09', () => {
    const now = local(2026, 9, 26, 10, 0); // Thứ bảy
    const presets = buildPresets('schedule', now, WINDOW);
    expect(presets.map((p) => p.label)).toEqual(['Sau 1 giờ', 'Tối nay 20:00', 'Sáng mai 08:00', 'Thứ Hai tới 08:00']);
    expect(dayjs(presets[3]?.at).format('YYYY-MM-DD HH:mm')).toBe('2026-09-28 08:00');
  });

  it('mốc ĐÃ QUA bị bỏ: sau 20:00 thì không còn "Tối nay 20:00"', () => {
    const presets = buildPresets('schedule', local(2026, 9, 26, 21, 30), WINDOW);
    expect(presets.map((p) => p.key)).toEqual(['in-1h', 'tomorrow', 'monday']);
  });

  it('mốc chưa đủ khoảng cách tối thiểu bị bỏ (19:59:30 → 20:00 cách < 60 giây)', () => {
    const now = local(2026, 9, 26, 19, 59) + 30_000;
    expect(buildPresets('schedule', now, WINDOW).map((p) => p.key)).not.toContain('tonight');
  });

  it('hôm nay là Thứ hai → "Thứ Hai tới" là TUẦN SAU, không phải hôm nay', () => {
    const presets = buildPresets('schedule', local(2026, 9, 28, 7, 0), WINDOW);
    expect(dayjs(presets.find((p) => p.key === 'monday')?.at).format('YYYY-MM-DD')).toBe('2026-10-05');
  });

  it('nhắc lại: "Sau 20 phút" thay cho "Tối nay"', () => {
    const presets = buildPresets('remind', local(2026, 9, 26, 10, 0), WINDOW);
    expect(presets.map((p) => p.label)).toEqual(['Sau 20 phút', 'Sau 1 giờ', 'Sáng mai 08:00', 'Thứ Hai tới 08:00']);
  });

  it('cửa sổ hẹp (giới hạn admin hạ xuống 2 ngày) → bỏ mốc xa hơn', () => {
    const presets = buildPresets('schedule', local(2026, 9, 26, 10, 0), { maxMs: daysToMs(1), minLeadMs: 60_000 });
    expect(presets.map((p) => p.key)).toEqual(['in-1h', 'tonight', 'tomorrow']);
  });
});
