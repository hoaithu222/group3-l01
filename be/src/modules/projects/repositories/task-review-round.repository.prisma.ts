import type { Prisma } from "@prisma/client";
import {
  closedRoundKey,
  openRoundKey,
  roundActiveKey,
  type ReviewProgress,
  type RoundCloseReason,
  type RoundCreateInput,
  type RoundUpdate,
  type TaskReviewRound,
} from "../entities/task-review.interface";
import type { ITaskReviewRoundRepository } from "./task-review.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type RoundRecord = Prisma.TaskReviewRoundGetPayload<Record<string, never>>;

export function mapRound(r: RoundRecord): TaskReviewRound {
  return {
    id: r.id,
    taskId: r.taskId,
    boardId: r.boardId,
    workspaceId: r.workspaceId,
    round: r.round,
    status: r.status,
    activeKey: r.activeKey,
    requiredReviews: r.requiredReviews,
    configuredReviews: r.configuredReviews,
    assignedCount: r.assignedCount,
    approvedCount: r.approvedCount,
    rubricSnapshot: (r.rubricSnapshot ?? []).map((c) => ({ id: c.id, label: c.label, description: c.description ?? null, maxScore: c.maxScore })),
    shortage: r.shortage,
    autoApproved: r.autoApproved,
    openedBy: r.openedBy ?? null,
    openedAt: r.openedAt,
    closedAt: r.closedAt ?? null,
    closeReason: (r.closeReason ?? null) as RoundCloseReason | null,
    waivedBy: r.waivedBy ?? null,
    waiveReason: r.waiveReason ?? null,
    version: r.version,
  };
}

export class PrismaTaskReviewRoundRepository implements ITaskReviewRoundRepository {
  async create(input: RoundCreateInput, tx?: TxContext): Promise<TaskReviewRound> {
    const r = await db(tx).taskReviewRound.create({
      data: {
        id: input.id,
        taskId: input.taskId,
        boardId: input.boardId,
        workspaceId: input.workspaceId,
        round: input.round,
        status: input.status,
        activeKey: roundActiveKey(input),
        requiredReviews: input.requiredReviews,
        configuredReviews: input.configuredReviews,
        assignedCount: input.assignedCount,
        approvedCount: input.approvedCount,
        rubricSnapshot: input.rubricSnapshot.map((c) => ({ id: c.id, label: c.label, description: c.description, maxScore: c.maxScore })),
        shortage: input.shortage,
        autoApproved: input.autoApproved,
        // Ghi null TƯỜNG MINH cho mọi trường sau này có thể lọc `{ field: null }` (Prisma+Mongo: trường vắng KHÔNG khớp `null`).
        openedBy: input.openedBy,
        openedAt: input.openedAt,
        closedAt: input.closedAt,
        closeReason: input.closeReason,
        waivedBy: null,
        waiveReason: null,
      },
    });
    return mapRound(r);
  }

  async findById(id: string, tx?: TxContext): Promise<TaskReviewRound | null> {
    const r = await db(tx).taskReviewRound.findUnique({ where: { id } });
    return r ? mapRound(r) : null;
  }

  async findOpen(taskId: string, tx?: TxContext): Promise<TaskReviewRound | null> {
    const r = await db(tx).taskReviewRound.findUnique({ where: { activeKey: openRoundKey(taskId) } });
    return r ? mapRound(r) : null;
  }

  async findLatest(taskId: string, tx?: TxContext): Promise<TaskReviewRound | null> {
    const r = await db(tx).taskReviewRound.findFirst({ where: { taskId }, orderBy: { round: "desc" } });
    return r ? mapRound(r) : null;
  }

  async listByTask(taskId: string, limit: number, tx?: TxContext): Promise<TaskReviewRound[]> {
    const rows = await db(tx).taskReviewRound.findMany({ where: { taskId }, orderBy: { round: "desc" }, take: limit });
    return rows.map(mapRound);
  }

  async listOpenByBoard(boardId: string, afterId: string | null, limit: number, tx?: TxContext): Promise<TaskReviewRound[]> {
    const rows = await db(tx).taskReviewRound.findMany({
      where: { boardId, status: "OPEN", ...(afterId && { id: { gt: afterId } }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(mapRound);
  }

  countOpenByBoard(boardId: string, tx?: TxContext): Promise<number> {
    return db(tx).taskReviewRound.count({ where: { boardId, status: "OPEN" } });
  }

  async progressOf(taskIds: string[], tx?: TxContext): Promise<Map<string, ReviewProgress>> {
    if (taskIds.length === 0) return new Map();
    const rows = await db(tx).taskReviewRound.findMany({
      where: { activeKey: { in: taskIds.map(openRoundKey) } },
      select: { taskId: true, approvedCount: true, requiredReviews: true },
    });
    return new Map(rows.map((r) => [r.taskId, { approvedCount: r.approvedCount, requiredReviews: r.requiredReviews }]));
  }

  async updateCas(id: string, expectedVersion: number, set: RoundUpdate, tx?: TxContext): Promise<TaskReviewRound | null> {
    const res = await db(tx).taskReviewRound.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(set.status !== undefined && { status: set.status, ...(set.status !== "OPEN" && { activeKey: closedRoundKey(id) }) }),
        ...(set.requiredReviews !== undefined && { requiredReviews: set.requiredReviews }),
        ...(set.assignedCount !== undefined && { assignedCount: set.assignedCount }),
        ...(set.approvedCount !== undefined && { approvedCount: set.approvedCount }),
        ...(set.shortage !== undefined && { shortage: set.shortage }),
        ...(set.autoApproved !== undefined && { autoApproved: set.autoApproved }),
        ...(set.closedAt !== undefined && { closedAt: set.closedAt }),
        ...(set.closeReason !== undefined && { closeReason: set.closeReason }),
        ...(set.waivedBy !== undefined && { waivedBy: set.waivedBy }),
        ...(set.waiveReason !== undefined && { waiveReason: set.waiveReason }),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async listOpenPage(afterId: string | null, limit: number): Promise<TaskReviewRound[]> {
    const rows = await db().taskReviewRound.findMany({
      where: { status: "OPEN", ...(afterId && { id: { gt: afterId } }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(mapRound);
  }
}
