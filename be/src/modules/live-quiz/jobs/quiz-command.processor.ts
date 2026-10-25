import type { Job } from "bullmq";
import { logger } from "../../../infrastructure/logger";
import { quizCommandSchema, type QuizCommand } from "../entities/live-quiz.commands";
import { getLiveQuizContainer } from "../live-quiz.container";

/**
 * Processor chung của ba job hẹn giờ (`quiz.question-deadline`, `quiz.auto-advance`, `quiz.host-timeout`) — chỉ đánh thức bộ thực thi:
 * ở tiến trình API/`all` chạy tại chỗ, ở worker thuần thì publish lên kênh lệnh để tiến trình có Socket.IO chạy và phát `quiz:*`
 * (worker không có `getIO()`). Mọi lệnh idempotent (CAS Lua) nên job trễ/chạy lại/trùng timer trong tiến trình đều vô hại.
 * Lỗi hạ tầng (Redis không publish được) → ném lại để BullMQ thử lại.
 */
export function quizCommandProcessor(expected: QuizCommand["type"]): (job: Job) => Promise<void> {
  return async (job) => {
    const parsed = quizCommandSchema.safeParse(job.data);
    if (!parsed.success || parsed.data.type !== expected) {
      logger.warn("[live-quiz] payload lệnh hẹn giờ không hợp lệ, bỏ qua", { id: job.id, expected });
      return;
    }
    await getLiveQuizContainer().bus.dispatch(parsed.data);
  };
}
