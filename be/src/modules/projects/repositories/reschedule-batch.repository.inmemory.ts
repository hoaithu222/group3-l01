import { newObjectId } from "../../../core/utils/object-id";
import {
  activeBatchKey,
  finishedBatchKey,
  isRescheduleFinal,
  type RescheduleBatch,
  type RescheduleBatchCreateInput,
} from "../entities/reschedule.interface";
import {
  DuplicateActiveBatchError,
  type IRescheduleBatchRepository,
  type RescheduleProgress,
} from "./reschedule-batch.repository.interface";

/** Bản in-memory cho unit test — mô phỏng unique `activeKey` và CAS theo `cursor`. */
export class InMemoryRescheduleBatchRepository implements IRescheduleBatchRepository {
  readonly batches = new Map<string, RescheduleBatch>();

  async create(input: RescheduleBatchCreateInput): Promise<RescheduleBatch> {
    const activeKey = activeBatchKey(input.boardId);
    if ([...this.batches.values()].some((b) => b.activeKey === activeKey)) throw new DuplicateActiveBatchError();
    const batch: RescheduleBatch = {
      id: newObjectId(),
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      sourceTaskId: input.sourceTaskId,
      requestedBy: input.requestedBy,
      sourceDueDate: input.sourceDueDate,
      activeKey,
      status: "QUEUED",
      items: input.items.map((i) => ({ ...i, result: null })),
      affectedCount: input.items.length,
      cursor: 0,
      appliedCount: 0,
      conflictCount: 0,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
    };
    this.batches.set(batch.id, structuredClone(batch));
    return structuredClone(batch);
  }

  async findById(id: string): Promise<RescheduleBatch | null> {
    const b = this.batches.get(id);
    return b ? structuredClone(b) : null;
  }

  async findActiveByBoard(boardId: string): Promise<RescheduleBatch | null> {
    const key = activeBatchKey(boardId);
    const b = [...this.batches.values()].find((x) => x.activeKey === key);
    return b ? structuredClone(b) : null;
  }

  async findStale(cutoff: Date, limit: number): Promise<RescheduleBatch[]> {
    const startOf = (b: RescheduleBatch): Date | null => (b.status === "QUEUED" ? b.createdAt : b.status === "RUNNING" ? b.startedAt : null);
    return [...this.batches.values()]
      .filter((b) => {
        const at = startOf(b);
        return at !== null && at.getTime() < cutoff.getTime();
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((b) => structuredClone(b));
  }

  async markRunning(id: string, now: Date): Promise<RescheduleBatch | null> {
    const b = this.batches.get(id);
    if (!b) return null;
    if (b.status === "QUEUED") Object.assign(b, { status: "RUNNING", startedAt: now });
    return structuredClone(b);
  }

  async recordProgress(id: string, expectedCursor: number, progress: RescheduleProgress): Promise<boolean> {
    const b = this.batches.get(id);
    if (!b || b.status !== "RUNNING" || b.cursor !== expectedCursor) return false;
    b.cursor = progress.nextCursor;
    b.appliedCount += progress.applied.length;
    b.conflictCount += progress.conflicts.length;
    for (const item of b.items) {
      if (progress.applied.includes(item.taskId)) item.result = "APPLIED";
      else if (progress.conflicts.includes(item.taskId)) item.result = "CONFLICT";
    }
    return true;
  }

  async finish(id: string, status: "DONE" | "PARTIAL" | "FAILED", now: Date, error: string | null): Promise<boolean> {
    const b = this.batches.get(id);
    if (!b || isRescheduleFinal(b.status)) return false;
    Object.assign(b, { status, activeKey: finishedBatchKey(id), finishedAt: now, error });
    return true;
  }
}
