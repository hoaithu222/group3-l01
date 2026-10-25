import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";

/**
 * Nộp chấm. Điểm/khoảng/bước 0,5 KHÔNG kiểm ở Zod mà ở `computeScore` (thuần, dùng chung app) để MỌI lỗi điểm trả `REVIEW_002`
 * kèm `details` chỉ rõ tiêu chí sai. Nhận xét bắt buộc khi Yêu cầu sửa → `REVIEW_006` (kiểm ở service, có mã nghiệp vụ riêng).
 */
export const submitReviewSchema = z.object({
  status: z.enum(["APPROVED", "REQUEST_CHANGES"]),
  rubricScores: z
    .array(z.object({ criterionId: z.string().min(1).max(40), score: z.number().finite() }))
    .max(LIMITS.review.rubricCriteriaMax)
    .default([]),
  /** Chỉ khi lượt KHÔNG có rubric. */
  score10: z.number().finite().optional(),
  feedback: z
    .string()
    .trim()
    .max(LIMITS.review.feedbackMax * 12)
    .refine((s) => graphemeLength(s) <= LIMITS.review.feedbackMax, "Nhận xét quá dài")
    .optional(),
  expectedVersion: z.number().int().min(1),
});
export type SubmitReviewDto = z.infer<typeof submitReviewSchema>;

/** Giao lại: `toUserId` vắng = hệ thống tự chọn theo cân tải. */
export const reassignReviewSchema = reasonSchema.extend({ toUserId: objectIdSchema.optional() });
export type ReassignReviewDto = z.infer<typeof reassignReviewSchema>;

export const waiveReviewSchema = reasonSchema;
export type WaiveReviewDto = z.infer<typeof waiveReviewSchema>;

export const myReviewsQuerySchema = cursorQuerySchema.extend({ status: z.enum(["PENDING", "SUBMITTED"]).default("PENDING") });
export type MyReviewsQueryDto = z.infer<typeof myReviewsQuerySchema>;

export const reviewStatsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(180).default(30) });
export type ReviewStatsQueryDto = z.infer<typeof reviewStatsQuerySchema>;
