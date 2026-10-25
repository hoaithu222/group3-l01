import { z } from 'zod';

import type { CapabilityLimits } from '@/core/capabilities';

import { FALLBACK_REVIEW_LIMITS, REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../constants/review.constants';

export type ReviewLimits = { [K in keyof typeof FALLBACK_REVIEW_LIMITS]: number };

/** `capabilities.limits.review` khai `unknown` cố ý (`capabilities.types.ts`) — ép kiểu tại đây, thiếu thì dùng trần cứng của BE. */
export function readReviewLimits(limits: CapabilityLimits | undefined): ReviewLimits {
  const raw = limits?.review as Partial<ReviewLimits> | undefined;
  return {
    criterionDescriptionMax: raw?.criterionDescriptionMax ?? FALLBACK_REVIEW_LIMITS.criterionDescriptionMax,
    criterionLabelMax: raw?.criterionLabelMax ?? FALLBACK_REVIEW_LIMITS.criterionLabelMax,
    criterionMaxScoreMax: raw?.criterionMaxScoreMax ?? FALLBACK_REVIEW_LIMITS.criterionMaxScoreMax,
    feedbackMax: raw?.feedbackMax ?? FALLBACK_REVIEW_LIMITS.feedbackMax,
    requiredMax: raw?.requiredMax ?? FALLBACK_REVIEW_LIMITS.requiredMax,
    rubricCriteriaMax: raw?.rubricCriteriaMax ?? FALLBACK_REVIEW_LIMITS.rubricCriteriaMax,
  };
}

/**
 * Cấu hình chấm chéo của bảng — GIỐNG `boardReviewConfigSchema` phía BE (Zod 3 ở BE, Zod 4 ở app: đối chiếu bằng tay, không chép chéo):
 * số lượt duyệt nguyên 1–trần, tối đa `rubricCriteriaMax` tiêu chí, tên 1–80 ký tự, mô tả ≤ 300, điểm tối đa nguyên 1–100.
 * `RubricDraft.maxScore` là chuỗi — nơi gọi đổi sang số trước khi parse (`Number('')` = 0 ⇒ lỗi "tối thiểu 1").
 */
export function reviewConfigSchema(limits: ReviewLimits) {
  return z.object({
    autoCompleteOnApproval: z.boolean(),
    enabled: z.boolean(),
    requiredReviews: z
      .number()
      .int('Số lượt duyệt phải là số nguyên')
      .min(1, 'Cần ít nhất 1 lượt duyệt')
      .max(limits.requiredMax, `Tối đa ${limits.requiredMax} lượt duyệt`),
    rubric: z
      .array(
        z.object({
          description: z.string().trim().max(limits.criterionDescriptionMax, `Mô tả tối đa ${limits.criterionDescriptionMax} ký tự`),
          label: z
            .string()
            .trim()
            .min(1, 'Tên tiêu chí không được để trống')
            .max(limits.criterionLabelMax, `Tên tiêu chí tối đa ${limits.criterionLabelMax} ký tự`),
          maxScore: z
            .number()
            .int('Điểm tối đa phải là số nguyên')
            .min(1, 'Điểm tối đa tối thiểu là 1')
            .max(limits.criterionMaxScoreMax, `Điểm tối đa của một tiêu chí là ${limits.criterionMaxScoreMax}`),
        }),
      )
      .max(limits.rubricCriteriaMax, `Tối đa ${limits.rubricCriteriaMax} tiêu chí`),
  });
}

/** Lý do giao lại / miễn chấm: 10–500 ký tự sau khi cắt khoảng trắng (BE `reasonSchema`). */
export const reviewReasonSchema = z
  .string()
  .trim()
  .min(REVIEW_REASON_MIN, `Lý do tối thiểu ${REVIEW_REASON_MIN} ký tự`)
  .max(REVIEW_REASON_MAX, `Lý do tối đa ${REVIEW_REASON_MAX} ký tự`);

export const isValidReviewReason = (reason: string): boolean => reviewReasonSchema.safeParse(reason).success;
