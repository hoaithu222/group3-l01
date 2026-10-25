import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, expectedVersionSchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIVE_QUIZ_STATUSES } from "../entities/live-quiz.interface";

/** DTO Zod v3 của `live-quiz` (p5-01 be.md §3). */
export const createSessionSchema = z.object({
  setId: objectIdSchema,
  workspaceId: objectIdSchema.optional(),
  count: z.number().int().min(1).max(LIMITS.liveQuiz.questionsMax),
  secondsPerQuestion: z
    .number()
    .int()
    .min(LIMITS.liveQuiz.secondsPerQuestion.min)
    .max(LIMITS.liveQuiz.secondsPerQuestion.max)
    .default(LIMITS.liveQuiz.secondsPerQuestion.default),
  shuffle: z.boolean().default(true),
  autoAdvance: z.boolean().default(false),
});
export type CreateSessionDto = z.infer<typeof createSessionSchema>;

export const joinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  nickname: z.string().trim().min(1).max(LIMITS.liveQuiz.nicknameMax).optional(),
});
export type JoinDto = z.infer<typeof joinSchema>;

/** start/next/end/cancel — CAS theo `version` của phiên. */
export const commandSchema = expectedVersionSchema;
export type CommandDto = z.infer<typeof commandSchema>;

export const kickSchema = z.object({ userId: objectIdSchema, reason: z.string().trim().max(200).optional() });
export type KickDto = z.infer<typeof kickSchema>;

export const answerSchema = z.object({
  index: z.number().int().min(0),
  choice: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.study.optionsMax - 1),
});
export type AnswerDto = z.infer<typeof answerSchema>;

/** Sự kiện socket `quiz:answer` (be.md §3) — cùng dạng `answerSchema` + `sessionId`. */
export const socketAnswerSchema = answerSchema.extend({ sessionId: objectIdSchema });
export type SocketAnswerDto = z.infer<typeof socketAnswerSchema>;

/** `GET /me/live-quiz/history` — cursor `(createdAt, id)` dùng chung `cursorQuerySchema`. */
export const historyQuerySchema = cursorQuerySchema;
export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;

/** `GET /admin/live-quiz/sessions` (p5-01 be.md §4) — lọc trạng thái + phân trang page/limit. */
export const adminSessionsQuerySchema = z.object({
  status: z.enum(LIVE_QUIZ_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminSessionsQueryDto = z.infer<typeof adminSessionsQuerySchema>;
