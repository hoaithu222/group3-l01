import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * Lệnh THỜI GIAN của phiên (be.md p5-01 §7): đóng câu khi hết giờ, tự chuyển câu, host mất kết nối quá hạn. Khai ở `entities`
 * (chỉ Zod, không kéo Redis/BullMQ) để service phụ thuộc vào cổng `IQuizScheduler` mà không biết cách bus hiện thực.
 */
export const QUIZ_QUEUE = "reports" as const;
export const QUIZ_JOB = {
  deadline: "quiz.question-deadline",
  autoAdvance: "quiz.auto-advance",
  hostTimeout: "quiz.host-timeout",
  persist: "live-quiz.persist",
  expireStale: "live-quiz.expire-stale",
} as const;

export const quizCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("close"), sessionId: objectIdSchema, index: z.number().int().min(0) }),
  z.object({ type: z.literal("advance"), sessionId: objectIdSchema, index: z.number().int().min(0) }),
  z.object({ type: z.literal("host-timeout"), sessionId: objectIdSchema, lastSeenMs: z.number().int().min(1) }),
]);
export type QuizCommand = z.infer<typeof quizCommandSchema>;

/** Tên job BullMQ tương ứng từng lệnh. */
export const QUIZ_COMMAND_JOB: Record<QuizCommand["type"], string> = {
  close: QUIZ_JOB.deadline,
  advance: QUIZ_JOB.autoAdvance,
  "host-timeout": QUIZ_JOB.hostTimeout,
};

/** Cổng lên lịch/huỷ lệnh cho service — bản thật là `QuizCommandBus` (bản giả cho unit test). `delayMs` tính từ NAY. */
export interface IQuizScheduler {
  schedule(cmd: QuizCommand, delayMs: number): Promise<void>;
  cancel(cmd: QuizCommand): Promise<void>;
}
