import type { ColumnKindValue } from "../../../core/constants/project";
import { db } from "./prisma-tx";
import type { IProjectStatsRepository, StatsBoardRow } from "./project-stats.repository.interface";

export class PrismaProjectStatsRepository implements IProjectStatsRepository {
  async workspaceExists(workspaceId: string): Promise<boolean> {
    return (await db().workspace.count({ where: { id: workspaceId } })) > 0;
  }

  async listBoards(workspaceId: string): Promise<StatsBoardRow[]> {
    const rows = await db().board.findMany({
      where: { workspaceId },
      select: { id: true, name: true, archivedAt: true, columns: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      archivedAt: r.archivedAt ?? null,
      columnCount: r.columns.length,
      updatedAt: r.updatedAt,
    }));
  }

  async countByBoardAndKind(workspaceId: string): Promise<{ boardId: string; kind: ColumnKindValue; count: number }[]> {
    const groups = await db().task.groupBy({
      by: ["boardId", "columnKind"],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    return groups.map((g) => ({ boardId: g.boardId, kind: g.columnKind, count: g._count._all }));
  }

  countOverdue(workspaceId: string, now: Date): Promise<number> {
    return db().task.count({
      where: { workspaceId, deletedAt: null, dueDate: { lt: now, not: null }, columnKind: { not: "DONE" } },
    });
  }

  async completedSince(workspaceId: string, since: Date, limit: number): Promise<Date[]> {
    const rows = await db().task.findMany({
      where: { workspaceId, deletedAt: null, completedAt: { gte: since, not: null } },
      select: { completedAt: true },
      take: limit,
    });
    return rows.flatMap((r) => (r.completedAt ? [r.completedAt] : []));
  }
}
