import { prisma } from "../../../infrastructure/database";
import type { ActivityCell } from "../entities/contribution.interface";
import type { ActivityDayRow, HeatmapFilter, IActivityDailyRepository } from "./activity-daily.repository.interface";
import { isPrismaUniqueViolation } from "./tx";

const CHUNK = 20;

const totalOf = (c: ActivityCell): number => c.taskEvents + c.checklistEvents + c.commentEvents + c.reviewEvents;

export class PrismaActivityDailyRepository implements IActivityDailyRepository {
  async replaceRange(boardId: string, workspaceId: string, fromDate: string, toDate: string, cells: readonly ActivityCell[]): Promise<void> {
    const wanted = new Map(cells.filter((c) => totalOf(c) > 0).map((c) => [`${c.userId}|${c.date}`, c]));
    const existing = await prisma.activityDaily.findMany({ where: { boardId, date: { gte: fromDate, lte: toDate } }, select: { id: true, userId: true, date: true } });
    const stale = existing.filter((e) => !wanted.has(`${e.userId}|${e.date}`)).map((e) => e.id);
    if (stale.length > 0) await prisma.activityDaily.deleteMany({ where: { id: { in: stale } } });

    const list = [...wanted.values()];
    for (let i = 0; i < list.length; i += CHUNK) {
      await Promise.all(list.slice(i, i + CHUNK).map((c) => this.upsertCell(boardId, workspaceId, c)));
    }
  }

  /** `updateMany` rồi `create` (bắt P2002 khi đua) — KHÔNG dùng `upsert` (hai tiến trình upsert cùng khoá MỚI → P2002 không tự thử lại). */
  private async upsertCell(boardId: string, workspaceId: string, c: ActivityCell): Promise<void> {
    const data = { taskEvents: c.taskEvents, checklistEvents: c.checklistEvents, commentEvents: c.commentEvents, reviewEvents: c.reviewEvents, total: totalOf(c) };
    const update = () => prisma.activityDaily.updateMany({ where: { boardId, userId: c.userId, date: c.date }, data });
    if ((await update()).count > 0) return;
    try {
      await prisma.activityDaily.create({ data: { boardId, workspaceId, userId: c.userId, date: c.date, ...data } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      await update();
    }
  }

  async list(filter: HeatmapFilter): Promise<ActivityDayRow[]> {
    const rows = await prisma.activityDaily.findMany({
      where: {
        date: { gte: filter.from, lte: filter.to },
        ...(filter.boardId && { boardId: filter.boardId }),
        ...(filter.workspaceId && { workspaceId: filter.workspaceId }),
        ...(filter.userId && { userId: filter.userId }),
      },
      select: { boardId: true, userId: true, date: true, taskEvents: true, checklistEvents: true, commentEvents: true, reviewEvents: true, total: true },
    });
    return rows;
  }
}
