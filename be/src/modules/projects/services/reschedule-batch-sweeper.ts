import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { IRescheduleBatchRepository } from "../repositories/reschedule-batch.repository.interface";
import type { RescheduleBatchProcessor } from "./reschedule-batch.processor";

export interface RescheduleBatchSweeperDeps {
  batches: IRescheduleBatchRepository;
  /** Dùng lại đường `fail` của lô nền: CAS `finish` + nhả `activeKey` + outbox `task.reschedule-bulk.completed` (FAILED) + `board:rescheduled` final. */
  processor: Pick<RescheduleBatchProcessor, "fail">;
  staleMinutes?: number;
  sweepMax?: number;
  clock?: () => Date;
}

export interface RescheduleSweepSummary {
  scanned: number;
  failed: number;
}

/**
 * Cron TĨNH `reschedule-batch.sweep` (p4-04 be.md §5.6): lô dời lịch `QUEUED`/`RUNNING` quá hạn (worker chết hẳn, job mất khỏi hàng đợi,
 * Redis mất lúc xếp job) giữ `activeKey = board:<id>` mãi ⇒ MỌI lệnh dời lịch của bảng bị `TASK_020`. Sweeper chuyển chúng sang `FAILED`,
 * nhả `activeKey` và báo người yêu cầu.
 *
 * Idempotent/an toàn khi đua: chạy lặp không đổi gì (lô đã kết thúc không còn trong `findStale`; `fail` CAS theo trạng thái chưa kết thúc);
 * worker còn sống ghi lượt bằng `recordProgress` CAS `status = RUNNING` nên sau khi lô sang `FAILED` lượt đó huỷ transaction và job kế
 * tiếp thấy lô đã kết thúc ⇒ bỏ qua (thẻ đã áp ở các lượt trước giữ nguyên, không áp đôi).
 */
export class RescheduleBatchSweeper {
  constructor(private readonly d: RescheduleBatchSweeperDeps) {}

  async sweep(): Promise<RescheduleSweepSummary> {
    const staleMinutes = this.d.staleMinutes ?? LIMITS.task.rescheduleBatchStaleMinutes;
    const cutoff = new Date(this.now().getTime() - staleMinutes * 60_000);
    const stale = await this.d.batches.findStale(cutoff, this.d.sweepMax ?? LIMITS.task.rescheduleBatchSweepMax);
    let failed = 0;
    for (const batch of stale) {
      const message = `Lô dời lịch không hoàn tất sau ${staleMinutes} phút (trạng thái ${batch.status}) — hệ thống tự đánh dấu thất bại để mở lại bảng`;
      if (await this.d.processor.fail(batch.id, message)) {
        failed += 1;
        logger.warn("[reschedule-batch.sweep] đã đóng lô treo", { batchId: batch.id, boardId: batch.boardId, status: batch.status, cursor: batch.cursor });
      }
    }
    return { scanned: stale.length, failed };
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
