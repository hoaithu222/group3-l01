import { z } from "zod";
import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { getProjectsContainer } from "../projects.container";
import { REBALANCE_JOB, REBALANCE_QUEUE } from "../services/rebalance-scheduler";

const payloadSchema = z.object({ boardId: objectIdSchema, columnId: z.string().min(1).max(20) });

/**
 * `board.rebalance-column` (queue `cron`, retry 2): nén khoá vị trí của một cột khi có khoá > 50 ký tự (be.md §5/§7).
 * Idempotent — chạy lại khi khoá đã ngắn là no-op. Payload sai định dạng → bỏ (không retry vô ích).
 */
registerJob(REBALANCE_QUEUE, REBALANCE_JOB, async (job) => {
  const parsed = payloadSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[board.rebalance-column] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  const { boardId, columnId } = parsed.data;
  const result = await getProjectsContainer().rebalanceService.rebalanceColumn(boardId, columnId);
  if (!result.skipped) logger.info("[board.rebalance-column] Đã nén khoá vị trí cột", { boardId, columnId, changed: result.changed });
});
