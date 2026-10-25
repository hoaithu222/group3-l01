import {
  countChoices,
  defaultConfig,
  isQuizItem,
  pickRun,
  quizItems,
  quizOptions,
} from '../utils/quick-quiz-items';
import { cardState, resultLevel, wrongRows } from '../utils/quick-quiz-result';
import type { StudyItemDto } from '../api/study.types';
import { makeChoiceItem, makeItem } from './fixtures';

/** Lọc câu chấm được, số câu/trộn của một lượt, trạng thái thẻ đáp án và nhận xét kết quả. */
const fill = (overrides: Partial<StudyItemDto> = {}) =>
  makeItem({ acceptedAnswers: ['Hà Nội'], id: 'f', order: 3, type: 'FILL_BLANK', ...overrides });

describe('quizItems / isQuizItem', () => {
  it('bỏ thẻ ghi nhớ, giữ trắc nghiệm / nhiều đáp án / đúng-sai / điền chỗ trống, theo `order`', () => {
    const items = [
      fill(),
      makeItem({ id: 'card', order: 1 }),
      makeChoiceItem({ id: 'mc', order: 2 }),
      makeChoiceItem({ id: 'ms', order: 4, type: 'MULTI_SELECT' }),
      makeChoiceItem({ id: 'tf', order: 0, type: 'TRUE_FALSE', options: [] }),
    ];
    expect(quizItems(items).map((item) => item.id)).toEqual(['tf', 'mc', 'f', 'ms']);
  });

  it('bỏ mục thiếu dữ liệu để làm: không lựa chọn / không đáp án đúng / điền chỗ trống không đáp án', () => {
    expect(isQuizItem(makeChoiceItem({ options: [] }))).toBe(false);
    expect(isQuizItem(makeChoiceItem({ correctOptionIds: [] }))).toBe(false);
    expect(isQuizItem(fill({ acceptedAnswers: [] }))).toBe(false);
    expect(isQuizItem(fill({ acceptedAnswers: ['  '] }))).toBe(false);
  });

  it('không đổi mảng gốc', () => {
    const items = [makeChoiceItem({ id: 'b', order: 2 }), makeChoiceItem({ id: 'a', order: 1 })];
    quizItems(items);
    expect(items.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('quizOptions', () => {
  it('đúng-sai không có lựa chọn ⇒ dự phòng hai lựa chọn cố định o_true / o_false', () => {
    const options = quizOptions(makeChoiceItem({ options: [], type: 'TRUE_FALSE' }));
    expect(options.map((o) => o.id)).toEqual(['o_true', 'o_false']);
  });

  it('có lựa chọn thì dùng đúng lựa chọn của mục', () => {
    expect(quizOptions(makeChoiceItem()).map((o) => o.text)).toEqual(['Hà Nội', 'Huế']);
  });
});

describe('số câu và chọn câu cho một lượt', () => {
  it('mốc chọn chỉ gồm mốc NHỎ HƠN tổng, luôn kết bằng "Tất cả"', () => {
    expect(countChoices(35)).toEqual([10, 20, 'all']);
    expect(countChoices(15)).toEqual([10, 'all']);
    expect(countChoices(10)).toEqual(['all']);
    expect(countChoices(3)).toEqual(['all']);
  });

  it('mặc định: 10 câu nếu bộ dài hơn 10, không thì tất cả; luôn bật "Trộn câu"', () => {
    expect(defaultConfig(35)).toEqual({ count: 10, shuffle: true });
    expect(defaultConfig(10)).toEqual({ count: 'all', shuffle: true });
  });

  it('không trộn ⇒ lấy các câu ĐẦU theo thứ tự; "Tất cả" lấy hết; bộ ngắn hơn mốc thì lấy hết', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `q${i}`);
    expect(pickRun(ids, { count: 10, shuffle: false })).toEqual(ids.slice(0, 10));
    expect(pickRun(ids, { count: 20, shuffle: false })).toEqual(ids.slice(0, 20));
    expect(pickRun(ids, { count: 'all', shuffle: false })).toEqual(ids);
    expect(pickRun(ids.slice(0, 4), { count: 10, shuffle: false })).toEqual(ids.slice(0, 4));
  });

  it('trộn ⇒ cùng tập câu, thứ tự đổi theo `random` tiêm vào (tất định trong test)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const run = pickRun(ids, { count: 'all', shuffle: true }, () => 0);
    expect([...run].sort()).toEqual(ids);
    expect(run).not.toEqual(ids);
  });
});

describe('cardState', () => {
  const correct = ['o_b', 'o_c'];

  it('trước khi chấm: chỉ "đang chọn" hoặc "chưa chọn"', () => {
    expect(cardState('o_a', ['o_a'], correct, false)).toBe('selected');
    expect(cardState('o_b', ['o_a'], correct, false)).toBe('idle');
  });

  it('sau khi chấm: chọn đúng · chọn sai · bỏ sót đáp án đúng · phần còn lại mờ đi', () => {
    const picked = ['o_a', 'o_b'];
    expect(cardState('o_b', picked, correct, true)).toBe('correct');
    expect(cardState('o_a', picked, correct, true)).toBe('wrong');
    expect(cardState('o_c', picked, correct, true)).toBe('missed');
    expect(cardState('o_d', picked, correct, true)).toBe('muted');
  });
});

describe('resultLevel / wrongRows', () => {
  it('nhận xét theo bốn mức, tông vòng điểm xanh lục từ 80%', () => {
    expect(resultLevel(100).message).toMatch(/Xuất sắc/);
    expect(resultLevel(80).tone).toBe('success');
    expect(resultLevel(79).tone).toBe('brand');
    expect(resultLevel(50).message).toMatch(/Khá ổn/);
    expect(resultLevel(10).message).toMatch(/Chưa vững/);
  });

  it('dòng câu sai: đề + đáp án đúng rút gọn; bỏ khoá không còn trong bộ', () => {
    const item = makeChoiceItem({ id: 'mc', prompt: 'x'.repeat(200) });
    const rows = wrongRows(['mc', 'gone'], new Map([['mc', item]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.answer).toBe('Huế');
    expect(rows[0]?.prompt.length).toBeLessThanOrEqual(100);
    expect(rows[0]?.prompt.endsWith('…')).toBe(true);
  });
});
