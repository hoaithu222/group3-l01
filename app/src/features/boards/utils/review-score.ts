import type { RubricCriterion, RubricScore } from '../api/reviews.types';

/**
 * Tính điểm chấm chéo phía app (p4-05 app.md §2 `utils/review-score.ts`) — CÙNG công thức BE
 * (`be/src/modules/projects/services/review/review-score.ts`, sau này import từ `contracts/` khi p0-09 sinh):
 * `score10 = round1(Σ điểm / Σ điểm tối đa × 10)`; điểm mỗi tiêu chí bước 0,5; lượt KHÔNG có rubric thì người chấm nhập thẳng
 * `score10` 0–10 bước 0,5. Hàm THUẦN — chỉ để hiện tổng ngay khi nhập và chặn gửi sớm; BE vẫn là nơi quyết (`REVIEW_002`).
 */

/** Bước điểm (0,5) — cả điểm từng tiêu chí lẫn điểm tự do. */
export const SCORE_STEP = 0.5;
export const SCORE10_MAX = 10;

/** Làm tròn 1 chữ số thập phân (nửa lên; bù sai số nhị phân) — ĐÚNG hàm BE dùng. */
export const round1 = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;

export const isHalfStep = (value: number): boolean => Number.isFinite(value) && Number.isInteger(value * 2);

/**
 * "8,0" — dấu PHẨY thập phân, luôn một chữ số lẻ. ⛔ Không `toLocaleString`/`Intl`: Hermes cắt bớt ICU nên cùng một số hiện hai kiểu
 * trên Android và iOS (`screen-layout.md`); `toFixed` không phụ thuộc ngôn ngữ.
 */
export function formatScore(value: number): string {
  return round1(value).toFixed(1).replace('.', ',');
}

/** Điểm tiêu chí ("2,5", "3") — bỏ ",0" thừa cho số nguyên. */
export function formatCriterionScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

export const rubricMaxTotal = (rubric: readonly RubricCriterion[]): number =>
  rubric.reduce((sum, criterion) => sum + criterion.maxScore, 0);

export type ScoreProblem = 'INVALID_STEP' | 'MISSING' | 'OUT_OF_RANGE';

/** Điểm đang nhập: `null` = chưa chấm. `free` chỉ dùng khi lượt không có rubric. */
export interface ScoreDraft {
  free: number | null;
  scores: Readonly<Record<string, number | null | undefined>>;
}

export const EMPTY_SCORE_DRAFT: ScoreDraft = { free: null, scores: {} };

function problemOf(value: number | null | undefined, max: number): ScoreProblem | null {
  if (value === null || value === undefined) return 'MISSING';
  if (!isHalfStep(value)) return 'INVALID_STEP';
  if (value < 0 || value > max) return 'OUT_OF_RANGE';
  return null;
}

/**
 * Lỗi từng ô theo `criterionId` (hoặc khoá `score10` khi không có rubric). Rỗng = hợp lệ. Cùng luật `evaluateScore` của BE:
 * thiếu · ngoài 0..max · lệch bước 0,5.
 */
export function scoreProblems(
  rubric: readonly RubricCriterion[],
  draft: ScoreDraft,
): Record<string, ScoreProblem> {
  const problems: Record<string, ScoreProblem> = {};
  if (rubric.length === 0) {
    const problem = problemOf(draft.free, SCORE10_MAX);
    if (problem) problems.score10 = problem;
    return problems;
  }
  for (const criterion of rubric) {
    const problem = problemOf(draft.scores[criterion.id], criterion.maxScore);
    if (problem) problems[criterion.id] = problem;
  }
  return problems;
}

export interface ScorePreview {
  /** Số tiêu chí đã có điểm hợp lệ. */
  filled: number;
  /** `null` khi còn ô thiếu/sai — chưa tính được tổng. */
  score10: number | null;
  total: number;
}

/** Tổng quy đổi thang 10 để hiện ngay khi nhập; chỉ có số khi MỌI ô hợp lệ (đúng lúc BE chấp nhận). */
export function previewScore(rubric: readonly RubricCriterion[], draft: ScoreDraft): ScorePreview {
  if (rubric.length === 0) {
    const ok = problemOf(draft.free, SCORE10_MAX) === null;
    return { filled: ok ? 1 : 0, score10: ok ? (draft.free as number) : null, total: 1 };
  }
  const problems = scoreProblems(rubric, draft);
  const filled = rubric.filter((criterion) => !(criterion.id in problems)).length;
  if (Object.keys(problems).length > 0) return { filled, score10: null, total: rubric.length };
  const sum = rubric.reduce((acc, criterion) => acc + (draft.scores[criterion.id] as number), 0);
  return { filled, score10: round1((sum / rubricMaxTotal(rubric)) * 10), total: rubric.length };
}

/** Phần điểm của thân `POST /task-reviews/:id/submit`: theo tiêu chí, hoặc `score10` khi không có rubric. */
export function scorePayload(
  rubric: readonly RubricCriterion[],
  draft: ScoreDraft,
): { rubricScores: RubricScore[]; score10?: number } {
  if (rubric.length === 0) return { rubricScores: [], score10: draft.free ?? undefined };
  return {
    rubricScores: rubric.map((criterion) => ({
      criterionId: criterion.id,
      score: draft.scores[criterion.id] as number,
    })),
  };
}
