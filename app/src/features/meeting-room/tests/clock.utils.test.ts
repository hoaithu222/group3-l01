import { elapsedSeconds, formatDuration, minutesUntil, remainingMs } from '../utils/clock.utils';
import { formatCountdown } from '../utils/countdown.utils';

/** Đồng hồ phòng họp: hàm thuần, "bây giờ" do nơi gọi truyền vào (giờ server). */

describe('formatDuration', () => {
  it('dưới một giờ → mm:ss; từ một giờ → h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(59)).toBe('00:59');
    expect(formatDuration(75)).toBe('01:15');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('số âm/NaN/lẻ không bao giờ ra chuỗi lạ', () => {
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(Number.NaN)).toBe('00:00');
    expect(formatDuration(61.9)).toBe('01:01');
  });
});

describe('elapsedSeconds / remainingMs / minutesUntil', () => {
  const now = Date.parse('2026-10-01T09:10:00.000Z');

  it('elapsedSeconds: từ mốc bắt đầu tới giờ server, không âm, thiếu mốc → 0', () => {
    expect(elapsedSeconds('2026-10-01T09:00:00.000Z', now)).toBe(600);
    expect(elapsedSeconds('2026-10-01T09:30:00.000Z', now)).toBe(0);
    expect(elapsedSeconds(null, now)).toBe(0);
    expect(elapsedSeconds('không phải ngày', now)).toBe(0);
  });

  it('remainingMs: còn bao lâu tới mốc, đã qua → 0', () => {
    expect(remainingMs('2026-10-01T09:14:12.000Z', now)).toBe(252_000);
    expect(remainingMs('2026-10-01T09:00:00.000Z', now)).toBe(0);
    expect(remainingMs(undefined, now)).toBe(0);
  });

  it('minutesUntil: làm tròn LÊN (còn 4 phút 1 giây vẫn báo 5 phút), quá hạn → 0', () => {
    expect(minutesUntil('2026-10-01T09:14:01.000Z', now)).toBe(5);
    expect(minutesUntil('2026-10-01T09:15:00.000Z', now)).toBe(5);
    expect(minutesUntil('2026-10-01T09:10:00.000Z', now)).toBe(0);
    expect(minutesUntil(null, now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('phút + giây, chỉ giây, giờ + phút, và "Sắp bắt đầu" khi hết', () => {
    expect(formatCountdown(252_000)).toBe('Còn 4 phút 12 giây');
    expect(formatCountdown(45_000)).toBe('Còn 45 giây');
    expect(formatCountdown(3_720_000)).toBe('Còn 1 giờ 2 phút');
    expect(formatCountdown(0)).toBe('Sắp bắt đầu');
    expect(formatCountdown(-1000)).toBe('Sắp bắt đầu');
    expect(formatCountdown(Number.NaN)).toBe('Sắp bắt đầu');
  });

  it('làm tròn LÊN theo giây (còn 0,4 giây vẫn "Còn 1 giây", không nhảy sang "Sắp bắt đầu" sớm)', () => {
    expect(formatCountdown(400)).toBe('Còn 1 giây');
  });
});
