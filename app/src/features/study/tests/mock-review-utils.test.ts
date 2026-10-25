import {
  isBlankAnswer,
  optionLetter,
  optionReviewState,
  optionTag,
  reviewCounts,
  reviewVerdict,
} from '../utils/mock-review-utils';
import { makeResultQuestion } from './mock-fixtures';

/** Xem lại đáp án: kết luận từng câu, trạng thái từng đáp án và nhãn chữ đi kèm (không chỉ màu) — logic thuần. */
const blank = makeResultQuestion(0, { correct: false, myAnswer: null });
const wrong = makeResultQuestion(1, {
  correct: false,
  myAnswer: { itemId: 'q2', optionIds: ['o_bbbbbb'], text: null },
});
const right = makeResultQuestion(2);

describe('reviewVerdict', () => {
  it('đúng · sai · bỏ trống (không có đáp án, hoặc đáp án rỗng)', () => {
    expect(reviewVerdict(right)).toBe('correct');
    expect(reviewVerdict(wrong)).toBe('wrong');
    expect(reviewVerdict(blank)).toBe('blank');
    expect(
      reviewVerdict({ correct: false, myAnswer: { itemId: 'q', optionIds: [], text: '  ' } }),
    ).toBe('blank');
  });

  it('isBlankAnswer: chữ khoảng trắng vẫn là bỏ trống; có lựa chọn hoặc có chữ là đã trả lời', () => {
    expect(isBlankAnswer(blank)).toBe(true);
    expect(isBlankAnswer(wrong)).toBe(false);
    expect(isBlankAnswer({ myAnswer: { itemId: 'q', optionIds: [], text: 'abc' } })).toBe(false);
  });
});

describe('optionReviewState + optionTag', () => {
  it('bốn trạng thái, mỗi trạng thái có nhãn CHỮ riêng (trừ đáp án trơn)', () => {
    expect(optionReviewState(true, true)).toBe('picked-correct');
    expect(optionReviewState(true, false)).toBe('picked-wrong');
    expect(optionReviewState(false, true)).toBe('missed');
    expect(optionReviewState(false, false)).toBe('plain');

    expect(optionTag('picked-correct')).toBe('Bạn chọn · Đúng');
    expect(optionTag('picked-wrong')).toBe('Bạn chọn · Sai');
    expect(optionTag('missed')).toBe('Đáp án đúng');
    expect(optionTag('plain')).toBeNull();
  });

  it('câu điền dùng động từ "trả lời" thay vì "chọn"', () => {
    expect(optionTag('picked-correct', 'fill')).toBe('Bạn trả lời · Đúng');
    expect(optionTag('picked-wrong', 'fill')).toBe('Bạn trả lời · Sai');
    expect(optionTag('missed', 'fill')).toBe('Đáp án đúng');
  });
});

describe('optionLetter / reviewCounts', () => {
  it('A, B, C…; quá 26 lựa chọn thì rơi về số', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(3)).toBe('D');
    expect(optionLetter(25)).toBe('Z');
    expect(optionLetter(26)).toBe('27');
  });

  it('đếm cả lượt theo kết luận', () => {
    expect(reviewCounts([right, wrong, blank, right])).toEqual({ blank: 1, correct: 2, wrong: 1 });
    expect(reviewCounts([])).toEqual({ blank: 0, correct: 0, wrong: 0 });
  });
});
