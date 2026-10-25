import {
  applyReview,
  formatInterval,
  nextEasiness,
  previewIntervals,
  SR_INTERVAL_MAX_DAYS,
  type Sm2Progress,
} from '../utils/sm2-preview';

/** `sm2-preview` khớp `be/src/modules/study/services/sm2.ts` (README p4-02 ST-07): sai số ở đây là hiện "16 ngày" mà server hẹn ngày khác. */
const NEW_CARD: Sm2Progress = { easiness: 2.5, interval: 0, repetition: 0 };

describe('sm2-preview — ST-07', () => {
  it('thẻ mới bấm "Dễ" ba lần liên tiếp: khoảng ôn 1 → 6 → 16, EF 2.6 → 2.7 → 2.8', () => {
    const first = applyReview(NEW_CARD, 'EASY');
    const second = applyReview(first, 'EASY');
    const third = applyReview(second, 'EASY');

    expect([first.interval, second.interval, third.interval]).toEqual([1, 6, 16]);
    expect([first.easiness, second.easiness, third.easiness]).toEqual([2.6, 2.7, 2.8]);
    expect([first.repetition, second.repetition, third.repetition]).toEqual([1, 2, 3]);
  });

  it('khoảng thứ ba dùng EF TRƯỚC lượt ôn: round(6 × 2.7) = 16, không phải round(6 × 2.8) = 17', () => {
    expect(applyReview({ easiness: 2.7, interval: 6, repetition: 2 }, 'EASY').interval).toBe(16);
  });

  it('"Quên" (q dưới 3) rơi lại học: repetition 0, khoảng 1 ngày; "Khó" (q=3) vẫn tiến lên', () => {
    const learned: Sm2Progress = { easiness: 2.5, interval: 16, repetition: 3 };
    expect(applyReview(learned, 'AGAIN')).toEqual({ easiness: 1.96, interval: 1, repetition: 0 });
    expect(applyReview(learned, 'HARD').repetition).toBe(4);
  });

  it('EF không xuống dưới 1.3', () => {
    let p: Sm2Progress = { easiness: 1.35, interval: 10, repetition: 3 };
    for (let i = 0; i < 5; i += 1) p = applyReview(p, 'AGAIN');
    expect(p.easiness).toBe(1.3);
    expect(nextEasiness(1.3, 1)).toBe(1.3);
  });

  it('khoảng ôn bị chặn trần 365 ngày', () => {
    expect(applyReview({ easiness: 2.5, interval: 300, repetition: 5 }, 'GOOD').interval).toBe(
      SR_INTERVAL_MAX_DAYS,
    );
  });

  it('xem trước cả bốn nút cho thẻ mới: mọi nút đều hẹn 1 ngày (lần ôn đầu)', () => {
    expect(previewIntervals(NEW_CARD)).toEqual({ AGAIN: 1, EASY: 1, GOOD: 1, HARD: 1 });
  });

  it('xem trước thẻ đang ở lần ôn thứ hai: 6 ngày, và "Quên" về 1 ngày', () => {
    const preview = previewIntervals({ easiness: 2.6, interval: 1, repetition: 1 });
    expect(preview).toEqual({ AGAIN: 1, EASY: 6, GOOD: 6, HARD: 6 });
  });
});

describe('formatInterval', () => {
  it.each([
    [1, '1 ngày'],
    [16, '16 ngày'],
    [29, '29 ngày'],
    [30, '1 tháng'],
    [75, '3 tháng'],
    [365, '1 năm'],
  ])('%i ngày → "%s"', (days, expected) => {
    expect(formatInterval(days)).toBe(expected);
  });
});
