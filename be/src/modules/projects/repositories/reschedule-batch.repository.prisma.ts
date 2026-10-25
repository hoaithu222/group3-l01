import { Prisma } from "@prisma/client";
import {
  activeBatchKey,
  finishedBatchKey,
  type RescheduleBatch,
  type RescheduleBatchCreateInput,
  type ReschedulePlanItem,
} from "../entities/reschedule.interface";
import {
  DuplicateActiveBatchError,
  type IRescheduleBatchRepository,
  type RescheduleProgress,
} from "./reschedule-batch.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type BatchRecord = Prisma.RescheduleBatchGetPayload<Record<string, never>>;
type ItemRecord = BatchRecord["items"][number];

/**
 * Schema khai `oldDueDate`/`newDueDate` là `DateTime` BẮT BUỘC, nhưng thẻ chỉ có ngày bắt đầu (không có hạn) vẫn có thể bị dời
 * (planner lấy `startDate` làm mốc). Thẻ không có hạn lưu mốc `epoch` — chỉ ở biên lưu trữ này, domain luôn thấy `null`.
 * (Đề xuất: đổi thành `DateTime?` ở lần `db push` kế tiếp rồi bỏ ánh xạ này.)
 */
const NO_DUE = new Date(0);
const BOARD_KEY_PREFIX = activeBatchKey("");
const toStoredDue = (d: Date | null): Date => d ?? NO_DUE;
const fromStoredDue = (d: Date): Date | null => (d.getTime() === 0 ? null : d);

const toItem = (r: ItemRecord): ReschedulePlanItem => ({
  taskId: r.taskId,
  expectedVersion: r.expectedVersion,
  oldStartDate: r.oldStartDate ?? null,
  oldDueDate: fromStoredDue(r.oldDueDate),
  newStartDate: r.newStartDate ?? null,
  newDueDate: fromStoredDue(r.newDueDate),
  assigneeIds: r.assigneeIds,
  result: r.result === "APPLIED" || r.result === "CONFLICT" ? r.result : null,
});

const toEntity = (r: BatchRecord): RescheduleBatch => ({
  id: r.id,
  workspaceId: r.workspaceId,
  boardId: r.boardId,
  sourceTaskId: r.sourceTaskId,
  requestedBy: r.requestedBy,
  sourceDueDate: r.sourceDueDate,
  activeKey: r.activeKey,
  status: r.status,
  items: r.items.map(toItem),
  affectedCount: r.affectedCount,
  cursor: r.cursor,
  appliedCount: r.appliedCount,
  conflictCount: r.conflictCount,
  error: r.error ?? null,
  createdAt: r.createdAt,
  startedAt: r.startedAt ?? null,
  finishedAt: r.finishedAt ?? null,
});

export class PrismaRescheduleBatchRepository implements IRescheduleBatchRepository {
  async create(input: RescheduleBatchCreateInput, tx: TxContext): Promise<RescheduleBatch> {
    try {
      const r = await db(tx).rescheduleBatch.create({
        data: {
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          sourceTaskId: input.sourceTaskId,
          requestedBy: input.requestedBy,
          sourceDueDate: input.sourceDueDate,
          activeKey: activeBatchKey(input.boardId),
          status: "QUEUED",
          items: input.items.map((i) => ({
            taskId: i.taskId,
            expectedVersion: i.expectedVersion,
            oldStartDate: i.oldStartDate,
            oldDueDate: toStoredDue(i.oldDueDate),
            newStartDate: i.newStartDate,
            newDueDate: toStoredDue(i.newDueDate),
            assigneeIds: i.assigneeIds,
            result: null,
          })),
          affectedCount: input.items.length,
          cursor: 0,
          appliedCount: 0,
          conflictCount: 0,
          // Quy ước Mongo: mọi trường optional sau này có thể lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      return toEntity(r);
    } catch (err) {
      // Ném lại (KHÔNG nuốt) — transaction Mongo đã huỷ sau P2002; service xử lý NGOÀI transaction.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new DuplicateActiveBatchError();
      throw err;
    }
  }

  async findById(id: string, tx?: TxContext): Promise<RescheduleBatch | null> {
    const r = await db(tx).rescheduleBatch.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async findActiveByBoard(boardId: string, tx?: TxContext): Promise<RescheduleBatch | null> {
    const r = await db(tx).rescheduleBatch.findUnique({ where: { activeKey: activeBatchKey(boardId) } });
    return r ? toEntity(r) : null;
  }

  async findStale(cutoff: Date, limit: number): Promise<RescheduleBatch[]> {
    // `activeKey` tiền tố `board:` dùng chỉ mục unique (lô đã kết thúc mang `batch:<id>`) nên không quét cả collection lịch sử.
    // `lt` trên trường nullable khớp cả `null` (Prisma+Mongo) ⇒ `startedAt` thêm `not: null`.
    const rows = await db().rescheduleBatch.findMany({
      where: {
        activeKey: { startsWith: BOARD_KEY_PREFIX },
        OR: [
          { status: "QUEUED", createdAt: { lt: cutoff } },
          { status: "RUNNING", startedAt: { lt: cutoff, not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async markRunning(id: string, now: Date): Promise<RescheduleBatch | null> {
    await db().rescheduleBatch.updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: now } });
    return this.findById(id);
  }

  async recordProgress(id: string, expectedCursor: number, progress: RescheduleProgress, tx: TxContext): Promise<boolean> {
    const c = db(tx);
    const res = await c.rescheduleBatch.updateMany({
      where: { id, cursor: expectedCursor, status: "RUNNING" },
      data: {
        cursor: progress.nextCursor,
        appliedCount: { increment: progress.applied.length },
        conflictCount: { increment: progress.conflicts.length },
      },
    });
    if (res.count === 0) return false;
    // Tuần tự (một phiên Mongo không chạy song song nhiều lệnh trong transaction).
    for (const [ids, result] of [[progress.applied, "APPLIED"], [progress.conflicts, "CONFLICT"]] as const) {
      if (ids.length === 0) continue;
      await c.rescheduleBatch.update({
        where: { id },
        data: { items: { updateMany: { where: { taskId: { in: ids } }, data: { result } } } },
      });
    }
    return true;
  }

  async finish(id: string, status: "DONE" | "PARTIAL" | "FAILED", now: Date, error: string | null, tx: TxContext): Promise<boolean> {
    const res = await db(tx).rescheduleBatch.updateMany({
      where: { id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status, activeKey: finishedBatchKey(id), finishedAt: now, error },
    });
    return res.count > 0;
  }
}
