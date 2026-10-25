import { z } from "zod";
import { boardReviewConfigSchema } from "../services/review/review-config.schema";

/** `PUT /boards/:id/review-config` — cấu hình đầy đủ (ghi đè) + `expectedVersion` (CAS theo `Board.version`). */
export const putReviewConfigSchema = boardReviewConfigSchema.extend({ expectedVersion: z.number().int().min(1) });

export type PutReviewConfigDto = z.infer<typeof putReviewConfigSchema>;
