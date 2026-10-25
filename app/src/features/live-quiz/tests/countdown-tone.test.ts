import { countdownSpeech, countdownTone, shouldAnnounce } from '../utils/countdown-tone';

/** Ngưỡng cảnh báo hết giờ theo TỈ LỆ của câu (có trần) và các mốc đọc cho trình đọc màn hình. */

describe('countdownTone', () => {
  it('câu 20 s: calm > 10 s · hurry 6–10 s · urgent ≤ 5 s · over ở 0', () => {
    const tone = (seconds: number) => countdownTone(seconds, 20);

    expect(tone(20)).toBe('calm');
    expect(tone(11)).toBe('calm');
    expect(tone(10)).toBe('hurry');
    expect(tone(6)).toBe('hurry');
    expect(tone(5)).toBe('urgent');
    expect(tone(1)).toBe('urgent');
    expect(tone(0)).toBe('over');
  });

  it('câu dài (120 s) không đổi màu sớm hơn 10 s / 5 s (trần)', () => {
    expect(countdownTone(60, 120)).toBe('calm');
    expect(countdownTone(11, 120)).toBe('calm');
    expect(countdownTone(10, 120)).toBe('hurry');
    expect(countdownTone(5, 120)).toBe('urgent');
  });

  it('câu ngắn (6 s) KHÔNG đỏ ngay từ giây đầu — đỏ cả câu thì màu hết nghĩa', () => {
    expect(countdownTone(6, 6)).toBe('calm');
    expect(countdownTone(3, 6)).toBe('hurry');
    expect(countdownTone(1, 6)).toBe('urgent');
  });

  it('số giây âm (đồng hồ lệch) coi như hết giờ', () => {
    expect(countdownTone(-2, 20)).toBe('over');
  });
});

describe('shouldAnnounce', () => {
  it('chỉ đọc ở các mốc 10 · 5 · 3 · hết giờ', () => {
    const at = (seconds: number) => shouldAnnounce(seconds, 30);

    expect([10, 5, 3, 0].map(at)).toEqual([true, true, true, true]);
    expect([30, 20, 9, 8, 6, 4, 2, 1].map(at)).toEqual(Array.from({ length: 8 }, () => false));
  });

  it('không đọc mốc còn NHIỀU HƠN hoặc bằng cả câu (mở câu 10 s không đọc "còn 10 giây" đè lên đề)', () => {
    expect(shouldAnnounce(10, 10)).toBe(false);
    expect(shouldAnnounce(5, 5)).toBe(false);
    expect(shouldAnnounce(5, 10)).toBe(true);
  });

  it('hết giờ luôn được đọc, kể cả câu 3 s', () => {
    expect(shouldAnnounce(0, 3)).toBe(true);
  });
});

describe('countdownSpeech', () => {
  it('"Còn N giây" / "Hết giờ"', () => {
    expect(countdownSpeech(7)).toBe('Còn 7 giây');
    expect(countdownSpeech(0)).toBe('Hết giờ');
  });
});
