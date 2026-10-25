import { LIMITS } from "../../../core/constants/limits";
import { OTHER_TAG, UNTAGGED_TAG, type MockQuestion, type MockTagScore } from "../entities/mock.interface";
import { gradeAnswer } from "./answer-grader";

/** Đáp án tối thiểu cần để chấm (thoả cả `MockAnswer` lẫn đầu vào chưa lưu). */
export interface ScorableAnswer {
  itemId: string;
  optionIds: readonly string[];
  text: string | null;
}

export interface QuestionResult {
  itemId: string;
  answered: boolean;
  correct: boolean;
  partial: number | null;
}

export interface AttemptScore {
  results: QuestionResult[];
  correctCount: number;
  answeredCount: number;
  /** Làm tròn 1 chữ số thập phân. */
  scorePct: number;
  passed: boolean;
  byTag: MockTagScore[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Chấm cả lượt trên SNAPSHOT (không đọc `StudyItem`): câu không trả lời = sai; `byTag` đếm mỗi câu vào MỌI thẻ của nó (câu không
 * thẻ → `__untagged`), giữ tối đa `LIMITS.mock.byTagMax` thẻ nhiều câu nhất, phần còn lại gộp `__other`. HÀM THUẦN.
 */
export function scoreAttempt(questions: readonly MockQuestion[], answers: readonly ScorableAnswer[], passPct: number): AttemptScore {
  const byItem = new Map(answers.map((a) => [a.itemId, a]));
  const results: QuestionResult[] = questions.map((q) => {
    const a = byItem.get(q.itemId);
    if (!a) return { itemId: q.itemId, answered: false, correct: false, partial: null };
    const graded = gradeAnswer(q, { optionIds: a.optionIds, text: a.text ?? undefined });
    return { itemId: q.itemId, answered: true, correct: graded.correct, partial: graded.partial ?? null };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const total = questions.length;
  const scorePct = total === 0 ? 0 : round1((correctCount / total) * 100);
  return {
    results,
    correctCount,
    answeredCount: results.filter((r) => r.answered).length,
    scorePct,
    passed: scorePct >= passPct,
    byTag: tagBreakdown(questions, results),
  };
}

export function tagBreakdown(questions: readonly MockQuestion[], results: readonly QuestionResult[]): MockTagScore[] {
  const byTag = new Map<string, MockTagScore>();
  questions.forEach((q, i) => {
    for (const tag of q.tags.length > 0 ? q.tags : [UNTAGGED_TAG]) {
      const s = byTag.get(tag) ?? { tag, correct: 0, total: 0 };
      s.total += 1;
      if (results[i]?.correct) s.correct += 1;
      byTag.set(tag, s);
    }
  });
  const ranked = [...byTag.values()].sort((a, b) => b.total - a.total || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const max = LIMITS.mock.byTagMax;
  if (ranked.length <= max) return ranked;
  const rest = ranked.slice(max).reduce((acc, s) => ({ tag: OTHER_TAG, correct: acc.correct + s.correct, total: acc.total + s.total }), {
    tag: OTHER_TAG,
    correct: 0,
    total: 0,
  });
  return [...ranked.slice(0, max), rest];
}
