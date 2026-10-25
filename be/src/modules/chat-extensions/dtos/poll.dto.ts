import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

const L = LIMITS.poll;

/** `/scopes/:scopeType/:scopeId/...` (alias `/channels/:id/...`, `/conversations/:id/...` gán sẵn `scopeType/scopeId`). */
export const scopeParamsSchema = z.object({
  scopeType: z.enum(["CHANNEL", "CONVERSATION"]),
  scopeId: objectIdSchema,
});
export type ScopeParamsDto = z.infer<typeof scopeParamsSchema>;

export const pollParamsSchema = z.object({ pollId: objectIdSchema });

/**
 * Tạo khảo sát. Độ dài THEO GRAPHEME kiểm ở service (`graphemeLength`); DTO chỉ chặn chuỗi khổng lồ bằng trần độ dài UTF-16 ×4 (emoji ghép). `.strict()` — trường lạ (vd `kind`,
 * `voterIds` client cố gửi) bị 400 `VAL_001` thay vì lặng lẽ bỏ qua.
 */
export const createPollSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    question: z.string().trim().min(1).max(L.questionMax * 4),
    options: z.array(z.string().trim().min(1).max(L.optionMax * 4)).min(L.optionsMin).max(L.optionsMax),
    multi: z.boolean().default(false),
    anonymous: z.boolean().default(false),
    closesAt: z.coerce.date().optional(),
    /** Chỉ kênh: tạo khảo sát trong thread (id tin gốc). */
    threadId: objectIdSchema.optional(),
  })
  .strict();
export type CreatePollDto = z.infer<typeof createPollSchema>;

export const voteSchema = z
  .object({
    optionIds: z.array(z.string().min(1).max(16)).min(1).max(L.optionsMax),
  })
  .strict();
export type VoteDto = z.infer<typeof voteSchema>;

export const votersQuerySchema = cursorQuerySchema.extend({
  optionId: z.string().min(1).max(16),
  limit: z.coerce.number().int().min(1).max(L.votersPageMax).default(50),
});
export type VotersQueryDto = z.infer<typeof votersQuerySchema>;
