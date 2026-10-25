import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { STUDY_OPTION_ID_REGEX } from "../entities/study-item.interface";

/**
 * Thi thử (p4-02 be.md §3). Id lựa chọn dùng `STUDY_OPTION_ID_REGEX` (`o_` + 4–6 ký tự) — TRUE_FALSE dùng `o_true`/`o_false`
 * nên KHÔNG khớp regex `{6}` của be.md gốc (điểm lệch đã ghi ở p4-01 be.md §13.15). Đề thi/đáp án KHÔNG bao giờ nhận `correct*` từ client.
 */
export const createAttemptSchema = z.object({
  count: z.number().int().min(1).max(LIMITS.mock.questionsMax),
  durationSec: z.number().int().min(LIMITS.mock.durationMinSec).max(LIMITS.mock.durationMaxSec),
  shuffle: z.boolean().default(true),
  passPct: z.number().int().min(1).max(100).default(LIMITS.mock.passPctDefault),
  /** Chỉ lấy câu có ít nhất một thẻ này. */
  tags: z.array(z.string().trim().min(1).max(LIMITS.study.tagMax)).max(5).optional(),
});
export type CreateAttemptDto = z.infer<typeof createAttemptSchema>;

export const answerSchema = z
  .object({
    itemId: objectIdSchema,
    /** Rỗng = bỏ chọn (xoá đáp án). */
    optionIds: z.array(z.string().regex(STUDY_OPTION_ID_REGEX)).max(LIMITS.study.optionsMax).optional(),
    text: z.string().max(LIMITS.study.acceptedAnswerMax).optional(),
    timeMs: z.number().int().min(0).max(LIMITS.mock.durationMaxSec * 1000).default(0),
  })
  .refine((v) => v.optionIds !== undefined || v.text !== undefined, { message: "Cần optionIds hoặc text" });
export type AnswerDto = z.infer<typeof answerSchema>;

export const putAnswersSchema = z.object({ answers: z.array(answerSchema).min(1).max(LIMITS.mock.answersBatchMax) });
export type PutAnswersDto = z.infer<typeof putAnswersSchema>;

export const attemptEventSchema = z.object({
  type: z.enum(["BACKGROUND", "FOREGROUND"]),
  at: z.coerce.date(),
  clientEventId: z.string().min(8).max(64),
});
export type AttemptEventDto = z.infer<typeof attemptEventSchema>;

/** `answers` kèm theo = đẩy nốt đáp án chưa lưu (mất mạng) TRƯỚC khi chấm; quá hạn thì bỏ qua (vẫn chấm phần đã lưu). */
export const submitSchema = z.object({ answers: z.array(answerSchema).max(LIMITS.mock.answersBatchMax).optional() });
export type SubmitDto = z.infer<typeof submitSchema>;

export const listAttemptsQuerySchema = cursorQuerySchema;
export type ListAttemptsQueryDto = z.infer<typeof listAttemptsQuerySchema>;

export const attemptIdParamSchema = z.object({ id: objectIdSchema });
