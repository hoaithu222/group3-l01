import { AppError } from "../../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import type { RubricCriterion, RubricScore } from "../../entities/task-review.interface";

/**
 * Tính điểm THUẦN (p4-05 be.md §5.3 bước 2) — app dùng CÙNG công thức (`app/src/features/boards/utils/review-score.ts`, sau này
 * import từ `contracts/`): `score10 = round1(Σ điểm / Σ điểm tối đa × 10)`; điểm mỗi tiêu chí bước 0,5; không rubric ⇒ người chấm nhập thẳng
 * `score10` 0–10 bước 0,5. Sai ⇒ `REVIEW_002` kèm `details` chỉ rõ tiêu chí/ô nào sai để client tô lỗi đúng chỗ.
 */

export interface ScoreInput {
  rubricScores: RubricScore[];
  score10?: number;
}

export interface ScoreResult {
  score10: number;
  /** Rỗng khi lượt không có rubric. */
  rubricScores: RubricScore[];
}

export type CriterionProblem = "MISSING" | "OUT_OF_RANGE" | "INVALID_STEP" | "DUPLICATE" | "UNKNOWN";
export type Score10Problem = "REQUIRED" | "OUT_OF_RANGE" | "INVALID_STEP" | "NOT_ALLOWED";

export interface ScoreProblems {
  criteria?: Record<string, CriterionProblem>;
  score10?: Score10Problem;
}

/** Làm tròn 1 chữ số thập phân (nửa lên; bù sai số nhị phân). */
export const round1 = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;

const isHalfStep = (v: number): boolean => Number.isFinite(v) && Number.isInteger(v * 2);

/** Kiểm điểm. Trả `{ ok: true, value }` hoặc `{ ok: false, problems }` — KHÔNG ném lỗi (dùng được ở client/test). */
export function evaluateScore(rubric: readonly RubricCriterion[], input: ScoreInput): { ok: true; value: ScoreResult } | { ok: false; problems: ScoreProblems } {
  if (rubric.length === 0) return evaluateFreeScore(input);

  const byId = new Map(rubric.map((c) => [c.id, c]));
  const criteria: Record<string, CriterionProblem> = {};
  const given = new Map<string, number>();
  for (const s of input.rubricScores) {
    const criterion = byId.get(s.criterionId);
    if (!criterion) criteria[s.criterionId] = "UNKNOWN";
    else if (given.has(s.criterionId)) criteria[s.criterionId] = "DUPLICATE";
    else if (!isHalfStep(s.score)) criteria[s.criterionId] = "INVALID_STEP";
    else if (s.score < 0 || s.score > criterion.maxScore) criteria[s.criterionId] = "OUT_OF_RANGE";
    else given.set(s.criterionId, s.score);
  }
  for (const c of rubric) if (!given.has(c.id) && !(c.id in criteria)) criteria[c.id] = "MISSING";
  if (Object.keys(criteria).length > 0) return { ok: false, problems: { criteria } };

  const total = rubric.reduce((sum, c) => sum + (given.get(c.id) as number), 0);
  const max = rubric.reduce((sum, c) => sum + c.maxScore, 0);
  return {
    ok: true,
    value: { score10: round1((total / max) * 10), rubricScores: rubric.map((c) => ({ criterionId: c.id, score: given.get(c.id) as number })) },
  };
}

function evaluateFreeScore(input: ScoreInput): { ok: true; value: ScoreResult } | { ok: false; problems: ScoreProblems } {
  if (input.rubricScores.length > 0) {
    const criteria = Object.fromEntries(input.rubricScores.map((s) => [s.criterionId, "UNKNOWN" as const]));
    return { ok: false, problems: { criteria } };
  }
  const v = input.score10;
  if (v === undefined || v === null) return { ok: false, problems: { score10: "REQUIRED" } };
  if (!isHalfStep(v)) return { ok: false, problems: { score10: "INVALID_STEP" } };
  if (v < 0 || v > 10) return { ok: false, problems: { score10: "OUT_OF_RANGE" } };
  return { ok: true, value: { score10: v, rubricScores: [] } };
}

/** Như `evaluateScore` nhưng ném `REVIEW_002` (400) khi sai. */
export function computeScore(rubric: readonly RubricCriterion[], input: ScoreInput): ScoreResult {
  const result = evaluateScore(rubric, input);
  if (!result.ok) throw new AppError(ErrorMessages[ErrorCode.REVIEW_002], 400, ErrorCode.REVIEW_002, result.problems);
  return result.value;
}
