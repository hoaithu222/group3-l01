import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** Ôn tập ngắt quãng (p4-02 be.md §3). */
export const enrollSchema = z.object({
  setId: objectIdSchema,
  newPerDay: z.number().int().min(0).max(LIMITS.sr.newPerDayMax).optional(),
});
export type EnrollDto = z.infer<typeof enrollSchema>;

export const enrollmentParamSchema = z.object({ setId: objectIdSchema });

export const dueQuerySchema = z.object({
  setId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.sr.dueBatch).default(LIMITS.sr.dueBatch),
});
export type DueQueryDto = z.infer<typeof dueQuerySchema>;

export const reviewSchema = z.object({
  itemId: objectIdSchema,
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  clientReviewId: z.string().min(8).max(64),
  /** Bị kẹp về `[now − 24h, now]` (không tin đồng hồ máy). */
  reviewedAt: z.coerce.date().optional(),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

export const summaryQuerySchema = z.object({ setId: objectIdSchema.optional() });
export type SummaryQueryDto = z.infer<typeof summaryQuerySchema>;
