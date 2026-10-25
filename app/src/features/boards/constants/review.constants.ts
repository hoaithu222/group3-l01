/**
 * `FALLBACK_REVIEW_LIMITS` CHÉP từ `LIMITS.review` của BE (`be/src/core/constants/limits.ts`, p4-05 be.md §9) và dùng khi
 * `capabilities.limits` chưa mang nhóm `review` — đổi số bên BE thì đổi Ở ĐÂY theo, đây là bản SAO chứ không phải nguồn (cùng cách
 * `FALLBACK_BOARD_LIMITS`/`FALLBACK_TASK_LIMITS`).
 */
export const FALLBACK_REVIEW_LIMITS = {
  criterionDescriptionMax: 300,
  criterionLabelMax: 80,
  criterionMaxScoreMax: 100,
  feedbackMax: 2000,
  requiredMax: 5,
  rubricCriteriaMax: 10,
} as const;

/** `reasonSchema` của BE: 10–500 ký tự sau trim (giao lại / miễn chấm ghi audit). */
export const REVIEW_REASON_MIN = 10;
export const REVIEW_REASON_MAX = 500;

/** Điểm tối đa gợi ý khi thêm tiêu chí mới. */
export const NEW_CRITERION_MAX_SCORE = 10;
