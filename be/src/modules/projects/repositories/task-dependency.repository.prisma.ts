import { Prisma } from "@prisma/client";
import type { Task } from "../entities/task.interface";
import {
  DuplicateDependencyError,
  type ITaskDependencyRepository,
  type TaskDependency,
  type TaskDependencyCreateInput,
} from "./task-dependency.repository.interface";
import { db } from "./prisma-tx";
import { mapTask } from "./task.repository.prisma";
import type { TxContext } from "./unit-of-work";

type DependencyRecord = Prisma.TaskDependencyGetPayload<Record<string, never>>;

function mapDependency(r: DependencyRecord): TaskDependency {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    boardId: r.boardId,
    predecessorId: r.predecessorId,
    successorId: r.successorId,
    type: r.type,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

export class PrismaTaskDependencyRepository implements ITaskDependencyRepository {
  async find(predecessorId: string, successorId: string, tx?: TxContext): Promise<TaskDependency | null> {
    const r = await db(tx).taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId, successorId } } });
    return r ? mapDependency(r) : null;
  }

  countPredecessors(successorId: string, tx?: TxContext): Promise<number> {
    return db(tx).taskDependency.count({ where: { successorId } });
  }

  countSuccessors(predecessorId: string, tx?: TxContext): Promise<number> {
    return db(tx).taskDependency.count({ where: { predecessorId } });
  }

  outgoing(predecessorIds: string[], limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]> {
    if (predecessorIds.length === 0) return Promise.resolve([]);
    return db(tx).taskDependency.findMany({
      where: { predecessorId: { in: predecessorIds } },
      select: { predecessorId: true, successorId: true },
      take: limit,
    });
  }

  incoming(successorIds: string[], limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]> {
    if (successorIds.length === 0) return Promise.resolve([]);
    return db(tx).taskDependency.findMany({
      where: { successorId: { in: successorIds } },
      select: { predecessorId: true, successorId: true },
      take: limit,
    });
  }

  async listForTask(taskId: string): Promise<{ predecessors: TaskDependency[]; successors: TaskDependency[] }> {
    const [pre, suc] = await Promise.all([
      db().taskDependency.findMany({ where: { successorId: taskId }, orderBy: { createdAt: "desc" } }),
      db().taskDependency.findMany({ where: { predecessorId: taskId }, orderBy: { createdAt: "desc" } }),
    ]);
    return { predecessors: pre.map(mapDependency), successors: suc.map(mapDependency) };
  }

  async create(input: TaskDependencyCreateInput, tx: TxContext): Promise<TaskDependency> {
    try {
      const r = await db(tx).taskDependency.create({ data: { ...input, type: "FINISH_TO_START" } });
      return mapDependency(r);
    } catch (err) {
      // Ném lại (KHÔNG nuốt) — transaction Mongo đã huỷ sau P2002; service xử lý ngoài transaction.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new DuplicateDependencyError();
      throw err;
    }
  }

  async delete(predecessorId: string, successorId: string, tx: TxContext): Promise<number> {
    const res = await db(tx).taskDependency.deleteMany({ where: { predecessorId, successorId } });
    return res.count;
  }

  async recount(taskId: string, tx: TxContext): Promise<Task | null> {
    const counts = await this.counts(taskId, tx);
    const res = await db(tx).task.updateMany({ where: { id: taskId, deletedAt: null }, data: { ...counts, version: { increment: 1 } } });
    return res.count === 0 ? null : this.reload(taskId, tx);
  }

  async recountIfChanged(taskId: string, tx?: TxContext): Promise<Task | null> {
    const counts = await this.counts(taskId, tx);
    // `{ not: n }` = `$ne` — khớp cả thẻ cũ CHƯA có trường (vắng mặt) ⇒ lần đầu vẫn ghi giá trị tường minh.
    const res = await db(tx).task.updateMany({
      where: {
        id: taskId,
        deletedAt: null,
        OR: [{ blockedByCount: { not: counts.blockedByCount } }, { blockingCount: { not: counts.blockingCount } }],
      },
      data: { ...counts, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.reload(taskId, tx);
  }

  /** Tuần tự (không Promise.all) — một phiên Mongo không chạy song song nhiều lệnh trong transaction. */
  private async counts(taskId: string, tx?: TxContext): Promise<{ blockedByCount: number; blockingCount: number }> {
    const c = db(tx);
    const incoming = await c.taskDependency.findMany({ where: { successorId: taskId }, select: { predecessorId: true } });
    const outgoing = await c.taskDependency.findMany({ where: { predecessorId: taskId }, select: { successorId: true } });
    const blockedByCount = await this.countOpen(incoming.map((e) => e.predecessorId), tx);
    const blockingCount = await this.countOpen(outgoing.map((e) => e.successorId), tx);
    return { blockedByCount, blockingCount };
  }

  private async reload(taskId: string, tx?: TxContext): Promise<Task | null> {
    const r = await db(tx).task.findUnique({ where: { id: taskId } });
    return r ? mapTask(r) : null;
  }

  async boardTasksInRange(boardId: string, from: Date, to: Date, limit: number): Promise<Task[]> {
    // Tập cha rộng hơn (lt/gte trên trường nullable PHẢI kèm `not: null`), lọc chính xác trong bộ nhớ.
    const rows = await db().task.findMany({
      where: {
        boardId,
        deletedAt: null,
        AND: [
          { OR: [{ dueDate: { not: null, gte: from } }, { startDate: { not: null, gte: from } }] },
          { OR: [{ startDate: { not: null, lte: to } }, { dueDate: { not: null, lte: to } }] },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(mapTask).filter((t) => {
      const start = t.startDate ?? t.dueDate;
      const end = t.dueDate ?? t.startDate;
      return !!start && !!end && start <= to && end >= from;
    });
  }

  edgesAmong(ids: string[]): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db().taskDependency.findMany({
      where: { predecessorId: { in: ids }, successorId: { in: ids } },
      select: { predecessorId: true, successorId: true },
    });
  }

  async liveTasks(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) return [];
    const rows = await db().task.findMany({ where: { id: { in: ids }, deletedAt: null } });
    return rows.map(mapTask);
  }

  async boardIdsWithEdges(afterBoardId: string | null, limit: number): Promise<string[]> {
    const groups = await db().taskDependency.groupBy({
      by: ["boardId"],
      where: afterBoardId ? { boardId: { gt: afterBoardId } } : undefined,
      orderBy: { boardId: "asc" },
      take: limit,
    });
    return groups.map((g) => g.boardId);
  }

  edgesOfBoard(boardId: string, limit: number, tx?: TxContext): Promise<Pick<TaskDependency, "predecessorId" | "successorId">[]> {
    return db(tx).taskDependency.findMany({ where: { boardId }, select: { predecessorId: true, successorId: true }, take: limit });
  }

  async tasksWithNonZeroCounts(boardId: string): Promise<Task[]> {
    const rows = await db().task.findMany({
      where: { boardId, deletedAt: null, OR: [{ blockedByCount: { gt: 0 } }, { blockingCount: { gt: 0 } }] },
    });
    return rows.map(mapTask);
  }

  private countOpen(ids: string[], tx?: TxContext): Promise<number> {
    if (ids.length === 0) return Promise.resolve(0);
    return db(tx).task.count({ where: { id: { in: ids }, deletedAt: null, columnKind: { not: "DONE" } } });
  }
}
