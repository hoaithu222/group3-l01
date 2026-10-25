import type { StudyItemDto } from '../api/study.types';
import { gradeQuickAnswer } from '../utils/quick-quiz-grader';
import { makeChoiceItem, makeItem } from './fixtures';

/**
 * Chấm Quiz nhanh — trắc nghiệm / đúng-sai / nhiều đáp án. Các ca lấy từ `be/src/modules/study/tests/answer-grader.test.ts` (cùng vectơ, cùng kết quả)
 * để "đúng ở Quiz nhanh" luôn nghĩa là "đúng ở Thi thử". Điền chỗ trống ở `quick-quiz-grader.fill.test.ts`.
 */
const mc = makeChoiceItem({
  correctOptionIds: ['o_bbbbbb'],
  options: [
    { id: 'o_aaaaaa', mediaAssetId: null, text: 'A' },
    { id: 'o_bbbbbb', mediaAssetId: null, text: 'B' },
    { id: 'o_cccccc', mediaAssetId: null, text: 'C' },
  ],
});

const multi: StudyItemDto = makeChoiceItem({
  correctOptionIds: ['o_a', 'o_b'],
  options: ['o_a', 'o_b', 'o_c', 'o_d'].map((id) => ({ id, mediaAssetId: null, text: id })),
  type: 'MULTI_SELECT',
});

const trueFalse = (correct: 'o_false' | 'o_true'): StudyItemDto =>
  makeChoiceItem({
    correctOptionIds: [correct],
    options: [
      { id: 'o_true', mediaAssetId: null, text: 'Đúng' },
      { id: 'o_false', mediaAssetId: null, text: 'Sai' },
    ],
    type: 'TRUE_FALSE',
  });

describe('gradeQuickAnswer — trắc nghiệm', () => {
  it('đúng khi chọn đúng MỘT id đáp án đúng', () => {
    expect(gradeQuickAnswer(mc, { optionIds: ['o_bbbbbb'] }).correct).toBe(true);
  });

  it('sai khi chọn đáp án khác, chọn nhiều hơn một, không chọn, hoặc thiếu trường', () => {
    expect(gradeQuickAnswer(mc, { optionIds: ['o_aaaaaa'] }).correct).toBe(false);
    expect(gradeQuickAnswer(mc, { optionIds: ['o_bbbbbb', 'o_aaaaaa'] }).correct).toBe(false);
    expect(gradeQuickAnswer(mc, { optionIds: [] }).correct).toBe(false);
    expect(gradeQuickAnswer(mc, {}).correct).toBe(false);
  });

  it('không trả `partial` (chỉ câu nhiều đáp án mới có)', () => {
    expect(gradeQuickAnswer(mc, { optionIds: ['o_bbbbbb'] })).toEqual({ correct: true });
  });
});

describe('gradeQuickAnswer — đúng / sai', () => {
  it('chấm theo id cố định o_true / o_false', () => {
    expect(gradeQuickAnswer(trueFalse('o_false'), { optionIds: ['o_false'] }).correct).toBe(true);
    expect(gradeQuickAnswer(trueFalse('o_false'), { optionIds: ['o_true'] }).correct).toBe(false);
    expect(gradeQuickAnswer(trueFalse('o_true'), { optionIds: ['o_true'] }).correct).toBe(true);
  });
});

describe('gradeQuickAnswer — nhiều đáp án', () => {
  it('đúng khi tập chọn BẰNG tập đúng, không phụ thuộc thứ tự chọn', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_b', 'o_a'] })).toEqual({
      correct: true,
      partial: 1,
    });
  });

  it('thiếu một đáp án đúng ⇒ SAI (dù có `partial`)', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_a'] })).toEqual({
      correct: false,
      partial: 0.5,
    });
  });

  it('thừa một đáp án sai ⇒ SAI; partial = đúng∩chọn/|đúng| − sai∩chọn/|sai|', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_a', 'o_b', 'o_c'] })).toEqual({
      correct: false,
      partial: 0.5,
    });
  });

  it('chọn 1 đúng + 2 sai ⇒ partial về sàn 0; không chọn gì ⇒ sai, partial 0', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_a', 'o_c', 'o_d'] }).partial).toBe(0);
    expect(gradeQuickAnswer(multi, { optionIds: [] })).toEqual({ correct: false, partial: 0 });
    expect(gradeQuickAnswer(multi, {})).toEqual({ correct: false, partial: 0 });
  });

  it('chọn trùng id hai lần vẫn tính một (tập, không phải danh sách)', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_a', 'o_a', 'o_b'] }).correct).toBe(true);
  });

  it('id lạ (không thuộc câu) làm sai', () => {
    expect(gradeQuickAnswer(multi, { optionIds: ['o_a', 'o_b', 'o_zzzz'] }).correct).toBe(false);
  });
});

it('thẻ ghi nhớ không có đúng/sai — luôn false (Quiz nhanh đã lọc chúng ra trước)', () => {
  expect(gradeQuickAnswer(makeItem(), { text: 'bất kỳ' })).toEqual({ correct: false });
});
