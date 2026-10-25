import { prisma } from "../../../infrastructure/database";
import type { IContributionSourceRepository, SourceDoneTask, SourceSubmittedReview } from "./contribution-source.repository.interface";

export class PrismaContributionSourceRepository implements IContributionSourceRepository {
  async listBoardsTouchedSince(since: Date, limit: number, afterId: string | null): Promise<Array<{ id: string; workspaceId: string }>> {
    return prisma.board.findMany({
      where: { archivedAt: null, updatedAt: { gte: since }, ...(afterId && { id: { gt: afterId } }) },
      select: { id: true, workspaceId: true },
      orderBy: { id: "asc" },
      take: limit,
    });
  }

  async listDoneTasks(boardId: string): Promise<SourceDoneTask[]> {
    const rows = await prisma.task.findMany({
      where: { boardId, columnKind: "DONE", completedAt: { not: null } },
      select: { id: true, boardId: true, workspaceId: true, assigneeIds: true, storyPoints: true, dueDate: true, completedAt: true, completionCount: true, deletedAt: true },
    });
    return rows.flatMap((t) =>
      t.completedAt
        ? [
            {
              id: t.id,
              boardId: t.boardId,
              workspaceId: t.workspaceId,
              assigneeIds: t.assigneeIds,
              storyPoints: t.storyPoints ?? null,
              dueDate: t.dueDate ?? null,
              completedAt: t.completedAt,
              completionCount: t.completionCount,
              deleted: t.deletedAt !== null && t.deletedAt !== undefined,
            },
          ]
        : []
    );
  }

  async listSubmittedReviewsSince(since: Date, limit: number, afterId: string | null): Promise<SourceSubmittedReview[]> {
    const rows = await prisma.taskReview.findMany({
      where: { status: { in: ["APPROVED", "REQUEST_CHANGES"] }, submittedAt: { not: null, gte: since }, ...(afterId && { id: { gt: afterId } }) },
      select: { id: true, taskId: true, boardId: true, workspaceId: true, reviewerId: true, status: true, score10: true, submittedAt: true },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.flatMap((r) =>
      r.submittedAt && (r.status === "APPROVED" || r.status === "REQUEST_CHANGES")
        ? [{ id: r.id, taskId: r.taskId, boardId: r.boardId, workspaceId: r.workspaceId, reviewerId: r.reviewerId, status: r.status, score10: r.score10 ?? null, submittedAt: r.submittedAt }]
        : []
    );
  }

  async findSubmittedReview(reviewId: string): Promise<SourceSubmittedReview | null> {
    const r = await prisma.taskReview.findUnique({
      where: { id: reviewId },
      select: { id: true, taskId: true, boardId: true, workspaceId: true, reviewerId: true, status: true, score10: true, submittedAt: true },
    });
    if (!r || !r.submittedAt || (r.status !== "APPROVED" && r.status !== "REQUEST_CHANGES")) return null;
    return { id: r.id, taskId: r.taskId, boardId: r.boardId, workspaceId: r.workspaceId, reviewerId: r.reviewerId, status: r.status, score10: r.score10 ?? null, submittedAt: r.submittedAt };
  }

  async taskStates(taskIds: readonly string[]): Promise<Map<string, { columnKind: string }>> {
    const ids = [...new Set(taskIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, columnKind: true } });
    return new Map(rows.map((t): [string, { columnKind: string }] => [t.id, { columnKind: t.columnKind }]));
  }

  async currentAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>> {
    const ids = [...new Set(taskIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, assigneeIds: true } });
    return new Map(rows.map((t): [string, string[]] => [t.id, t.assigneeIds]));
  }
}
