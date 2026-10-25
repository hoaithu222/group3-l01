import type { MockResultQuestionDto } from '../api/mock-attempts.types';

/** Kết luận của MỘT câu ở màn xem lại. `blank` = không trả lời (khác `wrong`: người học chưa hề chọn). */
export type ReviewVerdict = 'blank' | 'correct' | 'wrong';

export function isBlankAnswer(q: Pick<MockResultQuestionDto, 'myAnswer'>): boolean {
  const a = q.myAnswer;
  return !a || (a.optionIds.length === 0 && (a.text ?? '').trim().length === 0);
}

export function reviewVerdict(
  q: Pick<MockResultQuestionDto, 'correct' | 'myAnswer'>,
): ReviewVerdict {
  if (q.correct) return 'correct';
  return isBlankAnswer(q) ? 'blank' : 'wrong';
}

export const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  blank: 'Bỏ trống',
  correct: 'Đúng',
  wrong: 'Sai',
};

/**
 * Trạng thái của MỘT đáp án trong câu đã chấm — quyết định hình + chữ đi kèm (không chỉ màu):
 *  · `picked-correct` bạn chọn và đúng · `picked-wrong` bạn chọn nhưng sai
 *  · `missed` đáp án đúng mà bạn KHÔNG chọn · `plain` còn lại.
 */
export type OptionReviewState = 'missed' | 'picked-correct' | 'picked-wrong' | 'plain';

export function optionReviewState(picked: boolean, isCorrect: boolean): OptionReviewState {
  if (picked) return isCorrect ? 'picked-correct' : 'picked-wrong';
  return isCorrect ? 'missed' : 'plain';
}

/** Nhãn chữ đi kèm trạng thái (không chỉ màu). Câu điền là "trả lời", câu lựa chọn là "chọn"; `null` ⇒ đáp án trơn. */
export function optionTag(
  state: OptionReviewState,
  kind: 'fill' | 'option' = 'option',
): string | null {
  const verb = kind === 'fill' ? 'trả lời' : 'chọn';
  if (state === 'missed') return 'Đáp án đúng';
  if (state === 'picked-correct') return `Bạn ${verb} · Đúng`;
  return state === 'picked-wrong' ? `Bạn ${verb} · Sai` : null;
}

/** Chữ cái A, B, C… cho lựa chọn thứ `index` (0-based); quá 26 lựa chọn thì rơi về số. */
export function optionLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export interface ReviewCounts {
  blank: number;
  correct: number;
  wrong: number;
}

export function reviewCounts(questions: readonly MockResultQuestionDto[]): ReviewCounts {
  const counts: ReviewCounts = { blank: 0, correct: 0, wrong: 0 };
  for (const q of questions) counts[reviewVerdict(q)] += 1;
  return counts;
}
