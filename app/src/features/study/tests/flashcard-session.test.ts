import { FALLBACK_STUDY_LIMITS } from '../constants/study.constants';
import { newDraftItem } from '../utils/editor-draft';
import {
  currentKey,
  flip,
  isFinished,
  mark,
  next,
  previous,
  progressText,
  retryUnknown,
  shuffle,
  startSession,
} from '../utils/flashcard-session';
import { backText, frontLines, summarize } from '../utils/item-summary';
import { validateDraftItem } from '../utils/item-validation';
import { makeChoiceItem, makeItem } from './fixtures';

describe('phiên học thẻ (thuần)', () => {
  const keys = ['a', 'b', 'c'];

  it('lật, sang thẻ kế luôn về mặt trước, hết thẻ thì kết thúc', () => {
    let state = startSession(keys);
    expect(progressText(state)).toBe('1/3');
    state = flip(state);
    expect(state.flipped).toBe(true);
    state = next(state);
    expect(state).toMatchObject({ flipped: false, index: 1 });
    state = next(next(state));
    expect(isFinished(state)).toBe(true);
    expect(currentKey(state)).toBeUndefined();
    // Không lật/đi tiếp được sau khi kết thúc; "trước" quay về thẻ cuối.
    expect(flip(state)).toBe(state);
    expect(previous(state).index).toBe(2);
  });

  it('đánh dấu đã thuộc/chưa thuộc rồi sang thẻ kế; đánh dấu lại thì đổi phía, không đếm đôi', () => {
    let state = mark(startSession(keys), true);
    expect(state.known).toEqual(['a']);
    state = previous(state);
    state = mark(state, false);
    expect(state.known).toEqual([]);
    expect(state.unknown).toEqual(['a']);
  });

  it('"học lại thẻ chưa thuộc" tạo phiên chỉ gồm thẻ chưa thuộc, giữ thứ tự', () => {
    let state = startSession(keys);
    state = mark(state, false);
    state = mark(state, true);
    state = mark(state, false);
    const again = retryUnknown(state);
    expect(again.order).toEqual(['a', 'c']);
    expect(again).toMatchObject({ index: 0, known: [], unknown: [] });
  });

  it('xáo trộn tất định khi tiêm random, giữ nguyên tập thẻ', () => {
    const fixed = [0.9, 0.1, 0.5];
    let call = 0;
    const result = shuffle(keys, () => fixed[call++ % fixed.length] as number);
    expect([...result].sort()).toEqual(keys);
    expect(startSession(keys, true, () => 0).order).not.toEqual(keys);
  });
});

describe('mặt thẻ theo loại mục', () => {
  it('mặt sau: định nghĩa / đáp án đúng / Đúng-Sai / đáp án chấp nhận', () => {
    expect(backText(makeItem({ answerText: 'Hà Nội' }))).toBe('Hà Nội');
    expect(backText(makeChoiceItem())).toBe('Huế');
    expect(backText(makeItem({ correctOptionIds: ['o_false'], type: 'TRUE_FALSE' }))).toBe('Sai');
    expect(backText(makeItem({ acceptedAnswers: ['Hà Nội', 'Ha Noi'], type: 'FILL_BLANK' }))).toBe(
      'Hà Nội / Ha Noi',
    );
  });

  it('mặt trước trắc nghiệm liệt kê A/B/C…; summarize cắt gọn', () => {
    expect(frontLines(makeChoiceItem())).toEqual(['A. Hà Nội', 'B. Huế']);
    expect(summarize('x'.repeat(200), 10)).toHaveLength(10);
  });
});

describe('validateDraftItem (cùng luật BE)', () => {
  const limits = { ...FALLBACK_STUDY_LIMITS };
  const problemsOf = (patch: Partial<ReturnType<typeof newDraftItem>>) =>
    validateDraftItem({ ...newDraftItem(patch.type ?? 'FLASHCARD'), ...patch }, limits).map(
      (p) => p.field,
    );

  it('thẻ ghi nhớ cần cả hai mặt', () => {
    expect(problemsOf({ prompt: '', answerText: '' })).toEqual(['prompt', 'answerText']);
    expect(problemsOf({ answerText: 'b', prompt: 'a' })).toEqual([]);
  });

  it('trắc nghiệm: lựa chọn không rỗng và đúng MỘT đáp án; nhiều đáp án ≥ 1', () => {
    const base = newDraftItem('MULTIPLE_CHOICE');
    const fields = validateDraftItem({ ...base, prompt: 'q' }, limits).map((p) => p.field);
    expect(fields).toEqual(['options.0.text', 'options.1.text', 'correct']);
    const [o1, o2] = base.options;
    const ok = {
      ...base,
      correctKeys: [o1?.key as string],
      options: [
        { ...(o1 as object), text: 'a' },
        { ...(o2 as object), text: 'b' },
      ],
      prompt: 'q',
    };
    expect(validateDraftItem(ok as never, limits)).toEqual([]);
  });

  it('điền chỗ trống cần ≥ 1 đáp án chấp nhận', () => {
    expect(problemsOf({ acceptedAnswers: ['  '], prompt: 'q', type: 'FILL_BLANK' })).toEqual([
      'acceptedAnswers',
    ]);
  });
});
