import type { Prisma } from "@prisma/client";
import type {
  MyReviewRow,
  ReviewCancelReason,
  ReviewCreateInput,
  ReviewUpdate,
  ReviewerLoad,
  TaskReview,
} from "../entities/task-review.interface";
import type { ITaskReviewRepository } from "./task-review.repository.interface";
import { mapRound } from "./task-review-round.repository.prisma";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type ReviewRecord = Prisma.TaskReviewGetPayload<Record<string, never>>;

export function mapReview(r: ReviewRecord): TaskReview {
  return {
    id: r.id,
    roundId: r.roundId,
    taskId: r.taskId,
    boardId: r.boardId,
    workspaceId: r.workspaceId,
    reviewerId: r.reviewerId,
    status: r.status,
    assignedBy: r.assignedBy ?? null,
    assignedAt: r.assignedAt,
    submittedAt: r.submittedAt ?? null,
    score10: r.score10 ?? null,
    rubricScores: (r.rubricScores ?? []).map((s) => ({ criterionId: s.criterionId, score: s.score })),
    feedback: r.feedback ?? null,
    cancelReason: (r.cancelReason ?? null) as ReviewCancelReason | null,
    replacedById: r.replacedById ?? null,
    version: r.version,
  };
}

export class PrismaTaskReviewRepository implements ITaskReviewRepository {
  async createMany(inputs: ReviewCreateInput[], tx?: TxContext): Promise<TaskReview[]> {
    const client = db(tx);
    const created: TaskReview[] = [];
    // Tạo từng dòng (số người chấm ≤ 5): cần id trả về, và một dòng trùng `(roundId, reviewerId)` phải làm hỏng cả transaction chứ không lặng lẽ bỏ qua.
    for (const input of inputs) {
      const r = await client.taskReview.create({
        data: {
          roundId: input.roundId,
          taskId: input.taskId,
          boardId: input.boardId,
          workspaceId: input.workspaceId,
          reviewerId: input.reviewerId,
          status: "PENDING",
          assignedBy: input.assignedBy,
          assignedAt: input.assignedAt,
          // null TƯỜNG MINH: các trường này sau này bị lọc/đếm bằng `{ field: null }` (quy ước Prisma+Mongo).
          submittedAt: null,
          score10: null,
          feedback: null,
          cancelReason: null,
          replacedById: null,
        },
      });
      created.push(mapReview(r));
    }
    return created;
  }

  async findById(id: string, tx?: TxContext): Promise<TaskReview | null> {
    const r = await db(tx).taskReview.findUnique({ where: { id } });
    return r ? mapReview(r) : null;
  }

  async listByRound(roundId: string, tx?: TxContext): Promise<TaskReview[]> {
    const rows = await db(tx).taskReview.findMany({ where: { roundId }, orderBy: [{ assignedAt: "asc" }, { id: "asc" }] });
    return rows.map(mapReview);
  }

  async listByRounds(roundIds: string[], tx?: TxContext): Promise<TaskReview[]> {
    if (roundIds.length === 0) return [];
    const rows = await db(tx).taskReview.findMany({ where: { roundId: { in: roundIds } }, orderBy: [{ assignedAt: "asc" }, { id: "asc" }] });
    return rows.map(mapReview);
  }

  async updatePendingCas(id: string, expectedVersion: number, set: ReviewUpdate, tx?: TxContext): Promise<TaskReview | null> {
    const res = await db(tx).taskReview.updateMany({
      where: { id, version: expectedVersion, status: "PENDING" },
      data: {
        status: set.status,
        ...(set.submittedAt !== undefined && { submittedAt: set.submittedAt }),
        ...(set.score10 !== undefined && { score10: set.score10 }),
        ...(set.rubricScores !== undefined && { rubricScores: { set: set.rubricScores.map((s) => ({ criterionId: s.criterionId, score: s.score })) } }),
        ...(set.feedback !== undefined && { feedback: set.feedback }),
        ...(set.cancelReason !== undefined && { cancelReason: set.cancelReason }),
        ...(set.replacedById !== undefined && { replacedById: set.replacedById }),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async cancelPendingOfRound(roundId: string, reason: ReviewCancelReason, tx?: TxContext): Promise<TaskReview[]> {
    const client = db(tx);
    const pending = await client.taskReview.findMany({ where: { roundId, status: "PENDING" } });
    if (pending.length === 0) return [];
    await client.taskReview.updateMany({
      where: { roundId, status: "PENDING" },
      data: { status: "CANCELLED", cancelReason: reason, version: { increment: 1 } },
    });
    return pending.map((r) => ({ ...mapReview(r), status: "CANCELLED" as const, cancelReason: reason, version: r.version + 1 }));
  }

  async loadsOf(workspaceId: string, userIds: string[], tx?: TxContext): Promise<Map<string, ReviewerLoad>> {
    const loads = new Map<string, ReviewerLoad>();
    if (userIds.length === 0) return loads;
    const rows = await db(tx).taskReview.groupBy({
      by: ["reviewerId", "status"],
      where: { workspaceId, reviewerId: { in: userIds } },
      _count: { _all: true },
      _max: { assignedAt: true },
    });
    for (const row of rows) {
      const load = loads.get(row.reviewerId) ?? { userId: row.reviewerId, pending: 0, lastAssignedAt: null };
      if (row.status === "PENDING") load.pending += row._count._all;
      const at = row._max.assignedAt;
      if (at && (!load.lastAssignedAt || at > load.lastAssignedAt)) load.lastAssignedAt = at;
      loads.set(row.reviewerId, load);
    }
    return loads;
  }

  async listPendingOf(userIds: string[], workspaceId: string | null, limit: number): Promise<TaskReview[]> {
    if (userIds.length === 0) return [];
    const rows = await db().taskReview.findMany({
      where: { reviewerId: { in: userIds }, status: "PENDING", ...(workspaceId && { workspaceId }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(mapReview);
  }

  async listPendingPage(afterId: string | null, limit: number): Promise<TaskReview[]> {
    const rows = await db().taskReview.findMany({
      where: { status: "PENDING", ...(afterId && { id: { gt: afterId } }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(mapReview);
  }

  async listMine(userId: string, kind: "PENDING" | "SUBMITTED", cursor: { at: Date; id: string } | null, limit: number): Promise<MyReviewRow[]> {
    const client = db();
    const pending = kind === "PENDING";
    const status: Prisma.TaskReviewWhereInput["status"] = pending ? "PENDING" : { in: ["APPROVED", "REQUEST_CHANGES"] };
    // Khoá sắp xếp: `assignedAt` (chưa nộp) / `submittedAt` (đã nộp — trường nullable ⇒ luôn kèm `not: null`, `lt` khớp cả null).
    const before = (at: Date): Prisma.TaskReviewWhereInput => (pending ? { assignedAt: { lt: at } } : { submittedAt: { lt: at, not: null } });
    const tie = (cur: { at: Date; id: string }): Prisma.TaskReviewWhereInput => (pending ? { assignedAt: cur.at, id: { lt: cur.id } } : { submittedAt: cur.at, id: { lt: cur.id } });
    const rows = await client.taskReview.findMany({
      where: { reviewerId: userId, status, ...(cursor && { OR: [before(cursor.at), tie(cursor)] }) },
      orderBy: [pending ? { assignedAt: "desc" } : { submittedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    if (rows.length === 0) return [];
    const rounds = await client.taskReviewRound.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.roundId))] } } });
    const byId = new Map(rounds.map((r) => [r.id, mapRound(r)]));
    return rows.flatMap((r) => {
      const round = byId.get(r.roundId);
      return round ? [{ review: mapReview(r), round }] : [];
    });
  }
}
