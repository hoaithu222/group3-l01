import {
  TIMER_CRITICAL_MS,
  TIMER_WARN_MS,
  timerPhase,
  timerPhaseLabel,
  timerRatio,
} from '../utils/mock-timer-utils';

/** Ngưỡng cảnh báo hết giờ của đồng hồ thi thử — logic thuần (`CountdownTimer` chỉ vẽ theo giai đoạn). */
describe('timerPhase', () => {
  it('bình thường khi còn từ 5 phút trở lên', () => {
    expect(timerPhase(60 * 60_000)).toBe('normal');
    expect(timerPhase(TIMER_WARN_MS)).toBe('normal');
  });

  it('cảnh báo khi xuống DƯỚI 5 phút (còn đúng 5 phút chưa báo động)', () => {
    expect(timerPhase(TIMER_WARN_MS - 1)).toBe('warn');
    expect(timerPhase(TIMER_CRITICAL_MS)).toBe('warn');
  });

  it('sắp hết giờ khi dưới 1 phút', () => {
    expect(timerPhase(TIMER_CRITICAL_MS - 1)).toBe('critical');
    expect(timerPhase(1)).toBe('critical');
  });

  it('hết giờ khi ≤ 0 (kể cả âm: quá hạn)', () => {
    expect(timerPhase(0)).toBe('expired');
    expect(timerPhase(-5000)).toBe('expired');
  });
});

describe('timerPhaseLabel', () => {
  it('cảnh báo luôn có CHỮ (không chỉ màu); bình thường thì không nhắc gì', () => {
    expect(timerPhaseLabel('normal')).toBeNull();
    expect(timerPhaseLabel('warn')).toBe('Còn dưới 5 phút');
    expect(timerPhaseLabel('critical')).toBe('Còn dưới 1 phút');
    expect(timerPhaseLabel('expired')).toBe('Đã hết giờ');
  });
});

describe('timerRatio', () => {
  it('tỉ lệ còn lại, kẹp trong 0..1', () => {
    expect(timerRatio(300_000, 600_000)).toBe(0.5);
    expect(timerRatio(700_000, 600_000)).toBe(1);
    expect(timerRatio(-1, 600_000)).toBe(0);
  });

  it('tổng thời lượng không hợp lệ ⇒ vòng đầy (không bịa ra tiến độ, không chia cho 0)', () => {
    expect(timerRatio(1000, 0)).toBe(1);
    expect(timerRatio(1000, Number.NaN)).toBe(1);
  });
});
