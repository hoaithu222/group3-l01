import type { StudyItemDto } from '../api/study.types';
import {
  advance,
  canCheck,
  check,
  currentId,
  isFinished,
  pick,
  startRun,
  tally,
  typeText,
  type QuizRun,
} from '../utils/quick-quiz-session';
import { makeChoiceItem, makeItem } from './fixtures';

/** Máy trạng thái một lượt Quiz nhanh (hàm thuần): chọn → kiểm tra → sang câu; chuỗi đúng; kết quả tổng. */
const single = (id: string): StudyItemDto => makeChoiceItem({ id }); // đúng = o_bbbbbb
const multi = makeChoiceItem({
  correctOptionIds: ['o_aaaaaa', 'o_bbbbbb'],
  id: 'm1',
  type: 'MULTI_SELECT',
});
const fill = makeItem({
  acceptedAnswers: ['Hà Nội'],
  id: 'f1',
  matchMode: 'IGNORE_ACCENTS',
  type: 'FILL_BLANK',
});

/** Làm nhanh một câu: chọn `optionId` rồi kiểm tra. */
const answer = (run: QuizRun, item: StudyItemDto, optionId: string): QuizRun =>
  check(pick(run, optionId, false), item);

describe('chọn đáp án', () => {
  it('một đáp án: chọn là THAY; nhiều đáp án: bấm để bật/tắt', () => {
    let run = pick(startRun(['a']), 'o_aaaaaa', false);
    run = pick(run, 'o_bbbbbb', false);
    expect(run.picked).toEqual(['o_bbbbbb']);

    run = startRun(['m1']);
    run = pick(pick(run, 'o_aaaaaa', true), 'o_bbbbbb', true);
    expect(run.picked).toEqual(['o_aaaaaa', 'o_bbbbbb']);
    expect(pick(run, 'o_aaaaaa', true).picked).toEqual(['o_bbbbbb']);
  });

  it('đã chấm thì KHOÁ: không đổi được lựa chọn hay chữ nhập', () => {
    const item = single('a');
    const run = answer(startRun(['a']), item, 'o_aaaaaa');
    expect(pick(run, 'o_bbbbbb', false)).toBe(run);
    expect(typeText(run, 'gõ thêm')).toBe(run);
  });
});

describe('canCheck / check', () => {
  it('chưa chọn gì ⇒ không kiểm tra được và check() giữ nguyên trạng thái', () => {
    const run = startRun(['a']);
    expect(canCheck(run, single('a'))).toBe(false);
    expect(check(run, single('a'))).toBe(run);
  });

  it('câu điền: chữ nháp chỉ khoảng trắng chưa tính là có đáp án', () => {
    expect(canCheck(typeText(startRun(['f1']), '   '), fill)).toBe(false);
    expect(canCheck(typeText(startRun(['f1']), 'ha noi'), fill)).toBe(true);
  });

  it('chấm đúng ⇒ chuỗi +1, ghi kết quả; chấm sai ⇒ chuỗi về 0', () => {
    const item = single('a');
    const right = answer(startRun(['a', 'b']), item, 'o_bbbbbb');
    expect(right.checked).toEqual({ correct: true });
    expect(right.streak).toBe(1);
    expect(right.results).toEqual([{ correct: true, itemId: 'a' }]);

    const wrong = answer(advance(right), single('b'), 'o_aaaaaa');
    expect(wrong.streak).toBe(0);
    expect(wrong.bestStreak).toBe(1);
  });

  it('bấm "Kiểm tra" hai lần không cộng đôi', () => {
    const item = single('a');
    const once = answer(startRun(['a']), item, 'o_bbbbbb');
    expect(check(once, item)).toBe(once);
    expect(once.results).toHaveLength(1);
  });

  it('câu nhiều đáp án: thiếu một đáp án là SAI, có `partial`', () => {
    const run = check(pick(startRun(['m1']), 'o_aaaaaa', true), multi);
    expect(run.checked?.correct).toBe(false);
    expect(run.checked?.partial).toBeGreaterThan(0);
  });

  it('câu điền chấm theo chữ nhập', () => {
    expect(check(typeText(startRun(['f1']), 'HA NOI'), fill).checked).toEqual({ correct: true });
  });
});

describe('advance', () => {
  it('chưa chấm thì không sang câu kế; chấm rồi thì sang câu kế và xoá nháp', () => {
    const item = single('a');
    const fresh = pick(startRun(['a', 'b']), 'o_aaaaaa', false);
    expect(advance(fresh)).toBe(fresh);

    const next = advance(check(fresh, item));
    expect(next).toMatchObject({ checked: null, index: 1, picked: [], text: '' });
    expect(currentId(next)).toBe('b');
  });

  it('câu cuối chấm xong rồi advance ⇒ kết thúc lượt', () => {
    const run = advance(answer(startRun(['a']), single('a'), 'o_bbbbbb'));
    expect(isFinished(run)).toBe(true);
    expect(currentId(run)).toBeUndefined();
  });
});

describe('tally', () => {
  it('đếm đúng, phần trăm làm tròn, chuỗi dài nhất và danh sách câu sai THEO THỨ TỰ LÀM', () => {
    let run = startRun(['a', 'b', 'c', 'd']);
    const plan: [string, string][] = [
      ['a', 'o_bbbbbb'],
      ['b', 'o_bbbbbb'],
      ['c', 'o_aaaaaa'],
      ['d', 'o_bbbbbb'],
    ];
    for (const [id, optionId] of plan) run = advance(answer(run, single(id), optionId));

    expect(tally(run)).toEqual({
      bestStreak: 2,
      correct: 3,
      percent: 75,
      total: 4,
      wrongIds: ['c'],
    });
  });

  it('chưa làm câu nào ⇒ 0%, không chia cho 0', () => {
    expect(tally(startRun(['a']))).toEqual({
      bestStreak: 0,
      correct: 0,
      percent: 0,
      total: 0,
      wrongIds: [],
    });
  });
});
