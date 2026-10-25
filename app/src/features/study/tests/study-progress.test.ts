import {
  cardCounter,
  cardStatus,
  masteryMessage,
  passedPercent,
  percentOf,
  summarizeRatings,
} from '../components/flashcard/study-progress';

/** Tính tiến độ/tổng kết của phiên thẻ (hàm thuần) — con số hiện trên thanh tiến độ, vòng hoàn thành và ô số liệu. */
describe('percentOf', () => {
  it('làm tròn nguyên và kẹp 0..100', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(5, 5)).toBe(100);
    expect(percentOf(9, 5)).toBe(100);
    expect(percentOf(-1, 5)).toBe(0);
  });

  it('tổng 0, âm hoặc không phải số ⇒ 0 (không bao giờ ra "NaN%")', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(3, -2)).toBe(0);
    expect(percentOf(Number.NaN, 4)).toBe(0);
    expect(percentOf(2, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('cardCounter / passedPercent', () => {
  it('"n/tổng" đếm từ 1 và kẹp ở tổng (màn tóm tắt không ra "21/20")', () => {
    expect(cardCounter(0, 20)).toBe('1/20');
    expect(cardCounter(11, 40)).toBe('12/40');
    expect(cardCounter(20, 20)).toBe('20/20');
    expect(cardCounter(0, 0)).toBe('0/0');
  });

  it('thanh tiến độ = số thẻ ĐÃ QUA: thẻ đầu 0%, hết thẻ 100%, không vượt', () => {
    expect(passedPercent(0, 4)).toBe(0);
    expect(passedPercent(1, 4)).toBe(25);
    expect(passedPercent(4, 4)).toBe(100);
    expect(passedPercent(7, 4)).toBe(100);
    expect(passedPercent(0, 0)).toBe(0);
  });
});

describe('cardStatus', () => {
  it('trả thẻ đã chấm gì trong phiên; chưa chấm hoặc chưa có thẻ ⇒ null', () => {
    expect(cardStatus('a', ['a'], ['b'])).toBe('known');
    expect(cardStatus('b', ['a'], ['b'])).toBe('unknown');
    expect(cardStatus('c', ['a'], ['b'])).toBeNull();
    expect(cardStatus(undefined, ['a'], ['b'])).toBeNull();
  });
});

describe('summarizeRatings', () => {
  it('còn nhớ = mọi thẻ KHÔNG chọn "Quên" (SM-2: q ≥ 3 vẫn dãn lịch)', () => {
    expect(summarizeRatings({ AGAIN: 1, EASY: 2, GOOD: 1, HARD: 0 })).toEqual({
      recallPercent: 75,
      remembered: 3,
      total: 4,
    });
    expect(summarizeRatings({ AGAIN: 0, EASY: 0, GOOD: 0, HARD: 2 }).recallPercent).toBe(100);
    expect(summarizeRatings({ AGAIN: 3, EASY: 0, GOOD: 0, HARD: 0 }).recallPercent).toBe(0);
  });

  it('chưa ôn thẻ nào ⇒ 0/0/0, không chia cho 0', () => {
    expect(summarizeRatings({ AGAIN: 0, EASY: 0, GOOD: 0, HARD: 0 })).toEqual({
      recallPercent: 0,
      remembered: 0,
      total: 0,
    });
  });
});

describe('masteryMessage', () => {
  it('ba nấc theo % đã thuộc, và câu riêng khi thuộc hết', () => {
    expect(masteryMessage(100, 10, 10)).toBe('Bạn đã thuộc hết 10 thẻ.');
    expect(masteryMessage(90, 9, 10)).toMatch(/Gần như thuộc/);
    expect(masteryMessage(60, 6, 10)).toMatch(/một nửa/);
    expect(masteryMessage(10, 1, 10)).toMatch(/Mới bắt đầu/);
  });

  it('bộ không có thẻ nào thuộc không bị khen: 0% ⇒ nấc thấp nhất', () => {
    expect(masteryMessage(0, 0, 0)).toMatch(/Mới bắt đầu/);
  });
});
