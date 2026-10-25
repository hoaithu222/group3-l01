import { z } from "zod";
import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { getLiveQuizContainer } from "../live-quiz.container";
import { LIVE_QUIZ_PERSIST } from "../services/live-quiz.service";

const payloadSchema = z.object({ sessionId: objectIdSchema });

/**
 * `live-quiz.persist` (queue `reports`, p5-01 be.md §5/§7) — consumer outbox do `LiveQuizService.finish()` ghi trong transaction
 * (dedupeKey `live-quiz.persist:quiz:<id>`). Idempotent nhờ CAS `resultsPersistedAt` trong `persistResults()` → chạy lại vô hại.
 */
registerJob(LIVE_QUIZ_PERSIST.queue, LIVE_QUIZ_PERSIST.jobName, async (job) => {
  const parsed = payloadSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[live-quiz.persist] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  const written = await getLiveQuizContainer().service.persistResults(parsed.data.sessionId);
  if (written > 0) logger.info("[live-quiz.persist] Đã lưu kết quả phiên", { sessionId: parsed.data.sessionId, written });
  // -1 = khoá Redis của phiên đã hết hạn: KHÔNG đánh dấu persisted (không có kết quả để ghi) — cần điều tra thủ công.
  if (written < 0) logger.error("[live-quiz.persist] Dữ liệu Redis của phiên đã mất, không lưu được kết quả", { sessionId: parsed.data.sessionId });
});
