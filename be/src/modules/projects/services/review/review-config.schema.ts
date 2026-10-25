import { randomBytes } from "crypto";
import { z } from "zod";
import { LIMITS } from "../../../../core/constants/limits";
import { objectIdSchema } from "../../../../shared/dto/common-schemas";
import type { BoardReviewConfig, RubricCriterion } from "../../entities/task-review.interface";

/**
 * NGUỒN DUY NHẤT của cấu hình chấm chéo `Board.review` (p4-05 be.md §3): chỉ GHI qua `boardReviewConfigSchema` (+ `assignCriterionIds`),
 * ĐỌC qua `parseBoardReview` (mặc định TẮT khi `null`/hỏng — đọc nhẹ tay: một trường sai không được lặng lẽ tắt cả cấu hình).
 */

export const CRITERION_ID_REGEX = /^r_[A-Za-z0-9]{6}$/;
export const DEFAULT_REQUIRED_REVIEWS = 2;

export const rubricCriterionSchema = z.object({
  /** Thiếu = tiêu chí mới (server cấp id); có = sửa tiêu chí đã có, id ổn định khi đổi tên. */
  id: z.string().regex(CRITERION_ID_REGEX, "Mã tiêu chí không hợp lệ").optional(),
  label: z.string().trim().min(1, "Tên tiêu chí bắt buộc").max(LIMITS.review.criterionLabelMax),
  description: z.string().trim().max(LIMITS.review.criterionDescriptionMax).nullish(),
  maxScore: z.number().int().min(1).max(LIMITS.review.criterionMaxScoreMax),
});
export type RubricCriterionInput = z.infer<typeof rubricCriterionSchema>;

export const boardReviewConfigSchema = z.object({
  enabled: z.boolean(),
  requiredReviews: z.number().int().min(1).max(LIMITS.review.requiredMax),
  rubric: z.array(rubricCriterionSchema).max(LIMITS.review.rubricCriteriaMax).default([]),
  /** Luôn `true` — không cho tắt tự chấm; giữ trong JSON cho khớp đặc tả cũ. */
  preventSelfReview: z.literal(true).default(true),
  /** P1: giới hạn người chấm trong nhóm này (vắng = mọi thành viên MEMBER+). */
  reviewerPool: z.array(objectIdSchema).max(LIMITS.review.reviewerPoolMax).optional(),
  autoCompleteOnApproval: z.boolean().default(false),
});
export type BoardReviewConfigInput = z.infer<typeof boardReviewConfigSchema>;

export const defaultBoardReview = (requiredReviews: number = DEFAULT_REQUIRED_REVIEWS, enabled = false): BoardReviewConfig => ({
  enabled,
  requiredReviews,
  rubric: [],
  preventSelfReview: true,
  autoCompleteOnApproval: false,
});

const isObjectId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

function toCriterion(value: unknown): RubricCriterion[] {
  if (!value || typeof value !== "object") return [];
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || !CRITERION_ID_REGEX.test(c.id)) return [];
  if (typeof c.label !== "string" || c.label.trim() === "") return [];
  if (typeof c.maxScore !== "number" || !Number.isInteger(c.maxScore) || c.maxScore < 1) return [];
  return [{ id: c.id, label: c.label, description: typeof c.description === "string" && c.description !== "" ? c.description : null, maxScore: c.maxScore }];
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

/** `Board.review` thô (JSON, có thể null/thiếu/hỏng) → cấu hình chuẩn hoá. Không ném lỗi. */
export function parseBoardReview(raw: unknown, fallbackRequired: number = DEFAULT_REQUIRED_REVIEWS): BoardReviewConfig {
  if (!raw || typeof raw !== "object") return defaultBoardReview(fallbackRequired);
  const r = raw as Record<string, unknown>;
  const pool = Array.isArray(r.reviewerPool) ? r.reviewerPool.filter(isObjectId) : [];
  return {
    enabled: r.enabled === true,
    requiredReviews: clampInt(r.requiredReviews, 1, LIMITS.review.requiredMax, fallbackRequired),
    rubric: Array.isArray(r.rubric) ? r.rubric.flatMap(toCriterion) : [],
    preventSelfReview: true,
    ...(pool.length > 0 && { reviewerPool: [...new Set(pool)] }),
    autoCompleteOnApproval: r.autoCompleteOnApproval === true,
  };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** `r_` + 6 ký tự [A-Za-z0-9]. `taken` = id đang dùng (tránh trùng). */
export function newCriterionId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const bytes = randomBytes(6);
    const id = `r_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
    if (!taken.has(id)) return id;
  }
}

export type RubricProblem = { field: "rubric"; message: string };

/**
 * Gán id cho tiêu chí mới, giữ id đã có. Lỗi (id trùng trong yêu cầu, id không thuộc cấu hình hiện tại) → `problems` (service đổi thành
 * `REVIEW_004`). `existingIds` = id trong cấu hình đang lưu: client không được tự bịa id.
 */
export function assignCriterionIds(
  input: RubricCriterionInput[],
  existingIds: ReadonlySet<string>
): { rubric: RubricCriterion[]; problems: RubricProblem[] } {
  const problems: RubricProblem[] = [];
  const seen = new Set<string>();
  for (const c of input) {
    if (!c.id) continue;
    if (seen.has(c.id)) problems.push({ field: "rubric", message: "Mã tiêu chí bị trùng" });
    else if (!existingIds.has(c.id)) problems.push({ field: "rubric", message: "Tiêu chí không còn trong cấu hình hiện tại" });
    seen.add(c.id);
  }
  const taken = new Set<string>([...existingIds, ...seen]);
  const rubric = input.map((c): RubricCriterion => {
    const id = c.id ?? newCriterionId(taken);
    taken.add(id);
    return { id, label: c.label, description: c.description ? c.description : null, maxScore: c.maxScore };
  });
  const total = rubric.reduce((sum, c) => sum + c.maxScore, 0);
  if (rubric.length > 0 && total <= 0) problems.push({ field: "rubric", message: "Tổng điểm tối đa phải lớn hơn 0" });
  return { rubric, problems };
}

/** Tổng điểm tối đa của rubric (hiển thị "Tổng 10 điểm"). */
export const rubricTotal = (rubric: readonly RubricCriterion[]): number => rubric.reduce((sum, c) => sum + c.maxScore, 0);
