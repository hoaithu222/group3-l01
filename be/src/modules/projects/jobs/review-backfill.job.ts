import { logger } from "../../../infrastructure/logger";
import { registerJob } from "../../../infrastructure/queue";
import { REVIEW_BACKFILL_JOB, REVIEW_BACKFILL_QUEUE } from "../services/review/review-events";
import type { ReviewBackfillJob } from "../services/review/review-config.service";
import { getProjectsContainer } from "../projects.container";

/**
 * `reports/review.backfill` (outbox từ `PUT /boards/:id/review-config`, dedupeKey `review.backfill:board:<id>:v<version>`): bật chấm chéo ⇒ mở lượt cho
 * thẻ đang ở REVIEW; tắt ⇒ huỷ lượt đang mở. Idempotent theo `activeKey`/trạng thái lượt — retry hoặc bật-tắt liên tiếp không tạo lượt trùng.
 */
registerJob(REVIEW_BACKFILL_QUEUE, REVIEW_BACKFILL_JOB, async (job) => {
  const data = job.data as Partial<ReviewBackfillJob> | null;
  if (!data?.boardId || (data.mode !== "ENABLE" && data.mode !== "DISABLE" && data.mode !== "SYNC")) {
    logger.warn("[review.backfill] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  await getProjectsContainer().review.backfill.run({ boardId: data.boardId, version: data.version ?? 0, mode: data.mode });
});
