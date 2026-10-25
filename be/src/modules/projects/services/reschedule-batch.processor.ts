import { logger } from "../../../infrastructure/logger";
import { isRescheduleFinal, type RescheduleBatch } from "../entities/reschedule.interface";
import type { IEventOutbox } from "../events/event-outbox";
import { rescheduleBulkCompletedOutbox, rescheduledOutbox } from "../events/reschedule-event.factory";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { IRescheduleBatchRepository } from "../repositories/reschedule-batch.repository.interface";
import type { ITaskActivityRepository } from "../repositories/task-activity.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";
import type { BoardWriteRunner } from "./board-write-runner";
import { STATIC_DEPENDENCY_LIMITS, type IDependencyLimits } from "./dependency-limits";
import { applyRescheduleItems } from "./reschedule-apply";

export interface RescheduleBatchProcessorDeps {
  batches: IRescheduleBatchRepository;
  tasks: ITaskRepository;
  boards: IBoardRepository;
  /** Mỗi lượt là MỘT transaction trong hàng đợi ghi của bảng (xen kẽ công bằng với kéo/tạo thẻ giữa các lượt). */
  runner: BoardWriteRunner;
  activityRepo: ITaskActivityRepository;
  outbox: IEventOutbox;
  emitter: IBoardEmitter;
  /**
   * Số thẻ mỗi lượt (MỘT transaction/lượt, be.md §5.6). Vắng → `rescheduleSyncMax` hiệu lực (mặc định 200): cùng con số "áp được trong
   * một transaction" của đường đồng bộ, và admin HẠ được nếu DB chậm (transaction có timeout 10 s).
   */
  chunkSize?: number;
  limits?: IDependencyLimits;
  clock?: () => Date;
}

export type BatchProcessOutcome = "SKIPPED" | "DONE" | "PARTIAL";

interface ChunkResult {
  appliedIds: string[];
  final: boolean;
}

/**
 * Lô dời lịch nền (p4-04 be.md §5.6) — `task.reschedule-bulk` (queue `reports`). Idempotent theo `cursor`: MỖI lượt là một
 * transaction gồm (CAS + dời từng thẻ + activity + outbox `task.due-changed` + `recordProgress` CAS theo `cursor`), nên worker
 * chết giữa chừng chạy lại đúng lượt kế và không bao giờ áp đôi; hai worker đua cùng lượt ⇒ một bên thấy `cursor` lệch và huỷ transaction.
 * Lượt cuối ghi `DONE`/`PARTIAL` + `activeKey = batch:<id>` + outbox `task.rescheduled` (chỉ thẻ đã áp) và `task.reschedule-bulk.completed`.
 */
export class RescheduleBatchProcessor {
  constructor(private readonly d: RescheduleBatchProcessorDeps) {}

  async process(batchId: string): Promise<BatchProcessOutcome> {
    const loaded = await this.d.batches.findById(batchId);
    if (!loaded || isRescheduleFinal(loaded.status)) return "SKIPPED";
    const batch = await this.d.batches.markRunning(batchId, this.now());
    if (!batch || isRescheduleFinal(batch.status)) return "SKIPPED";

    const size = this.d.chunkSize ?? Math.max(1, (await (this.d.limits ?? STATIC_DEPENDENCY_LIMITS).load()).rescheduleSyncMax);
    let cursor = batch.cursor;
    if (batch.items.length === 0) {
      await this.d.runner.run(batch.boardId, (tx) => this.finish(tx, batch));
      return this.emitFinal(batch);
    }
    while (cursor < batch.items.length) {
      const chunk = batch.items.slice(cursor, cursor + size);
      const result = await this.runChunk(batch, cursor, chunk, cursor + chunk.length >= batch.items.length);
      this.d.emitter.boardRescheduled(batch.boardId, {
        boardId: batch.boardId,
        rescheduleId: batch.id,
        batchId: batch.id,
        taskIds: result.appliedIds,
        count: result.appliedIds.length,
        final: result.final,
      });
      cursor += chunk.length;
    }
    const done = await this.d.batches.findById(batchId);
    return done?.status === "PARTIAL" ? "PARTIAL" : "DONE";
  }

  /**
   * Lượt cuối của mọi lần thử đã hết (hoặc cron quét lô treo): ghi `FAILED`, nhả `activeKey`, vẫn báo người yêu cầu. Không ném lỗi.
   * Trả `true` khi CHÍNH lời gọi này chuyển lô sang `FAILED` (lô đã kết thúc/không còn/ghi lỗi → `false`) — cron dùng để đếm; gọi lặp vô hại.
   */
  async fail(batchId: string, message: string): Promise<boolean> {
    try {
      const batch = await this.d.batches.findById(batchId);
      if (!batch || isRescheduleFinal(batch.status)) return false;
      const failed = await this.d.runner.run(batch.boardId, (tx) => this.finish(tx, batch, "FAILED", message.slice(0, 500)));
      if (failed) {
        this.d.emitter.boardRescheduled(batch.boardId, { boardId: batch.boardId, rescheduleId: batch.id, batchId: batch.id, taskIds: [], count: 0, final: true });
      }
      return failed;
    } catch (err) {
      logger.error("[task.reschedule-bulk] không ghi được trạng thái FAILED", { batchId, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  private async runChunk(batch: RescheduleBatch, cursor: number, chunk: RescheduleBatch["items"], isLast: boolean): Promise<ChunkResult> {
    return this.d.runner.run(batch.boardId, async (tx) => {
      const board = await this.d.boards.findById(batch.boardId, tx);
      const ctx = {
        actorId: batch.requestedBy,
        boardId: batch.boardId,
        workspaceId: batch.workspaceId,
        sourceTaskId: batch.sourceTaskId,
        rescheduleId: batch.id,
        batchId: batch.id,
      };
      // Bảng bị lưu trữ giữa chừng ⇒ phần còn lại KHÔNG được ghi (mọi thẻ = xung đột), lô kết thúc `PARTIAL`.
      const out = await applyRescheduleItems(this.d, tx, ctx, chunk, !!board && !board.archivedAt);
      const progress = {
        applied: out.applied.map((a) => a.item.taskId),
        conflicts: out.conflicts.map((c) => c.taskId),
        nextCursor: cursor + chunk.length,
      };
      if (!(await this.d.batches.recordProgress(batch.id, cursor, progress, tx))) {
        throw new Error("Lô dời lịch đã được worker khác đẩy qua lượt này (cursor lệch)");
      }
      if (isLast) await this.finish(tx, batch);
      return { appliedIds: progress.applied, final: isLast };
    });
  }

  /** Đọc lại lô TRONG transaction (đã thấy kết quả các lượt trước + lượt này) rồi kết thúc + ghi outbox. */
  private async finish(tx: TxContext, batch: RescheduleBatch, forced?: "FAILED", error: string | null = null): Promise<boolean> {
    const fresh = (await this.d.batches.findById(batch.id, tx)) ?? batch;
    const status = forced ?? (fresh.conflictCount > 0 ? "PARTIAL" : "DONE");
    if (!(await this.d.batches.finish(batch.id, status, this.now(), error, tx))) return false;
    const where = { boardId: batch.boardId, workspaceId: batch.workspaceId };
    const applied = fresh.items.filter((i) => i.result === "APPLIED");
    if (status !== "FAILED" && applied.length > 0) {
      await this.d.outbox.add(
        tx,
        rescheduledOutbox({ ...where, rescheduleId: batch.id, batchId: batch.id, sourceTaskId: batch.sourceTaskId, actorId: batch.requestedBy, items: applied })
      );
    }
    await this.d.outbox.add(
      tx,
      rescheduleBulkCompletedOutbox({
        ...where,
        batchId: batch.id,
        requestedBy: batch.requestedBy,
        sourceTaskId: batch.sourceTaskId,
        status,
        appliedCount: fresh.appliedCount,
        conflictCount: fresh.conflictCount,
      })
    );
    return true;
  }

  private emitFinal(batch: RescheduleBatch): BatchProcessOutcome {
    this.d.emitter.boardRescheduled(batch.boardId, { boardId: batch.boardId, rescheduleId: batch.id, batchId: batch.id, taskIds: [], count: 0, final: true });
    return "DONE";
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
