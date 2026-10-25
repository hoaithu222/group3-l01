/* eslint-disable @typescript-eslint/require-await -- bản in-memory (test) cài đặt interface bất đồng bộ */
import type { ActivityCell } from "../entities/contribution.interface";
import type { ActivityDayRow, HeatmapFilter, IActivityDailyRepository } from "./activity-daily.repository.interface";

interface Stored extends ActivityDayRow {
  workspaceId: string;
}

/** In-memory (test). */
export class InMemoryActivityDailyRepository implements IActivityDailyRepository {
  readonly rows = new Map<string, Stored>();

  async replaceRange(boardId: string, workspaceId: string, fromDate: string, toDate: string, cells: readonly ActivityCell[]): Promise<void> {
    for (const [key, row] of this.rows) if (row.boardId === boardId && row.date >= fromDate && row.date <= toDate) this.rows.delete(key);
    for (const c of cells) {
      const total = c.taskEvents + c.checklistEvents + c.commentEvents + c.reviewEvents;
      if (total === 0) continue;
      this.rows.set(`${boardId}|${c.userId}|${c.date}`, {
        boardId,
        workspaceId,
        userId: c.userId,
        date: c.date,
        taskEvents: c.taskEvents,
        checklistEvents: c.checklistEvents,
        commentEvents: c.commentEvents,
        reviewEvents: c.reviewEvents,
        total,
      });
    }
  }

  async list(filter: HeatmapFilter): Promise<ActivityDayRow[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.date >= filter.from &&
          r.date <= filter.to &&
          (!filter.boardId || r.boardId === filter.boardId) &&
          (!filter.workspaceId || r.workspaceId === filter.workspaceId) &&
          (!filter.userId || r.userId === filter.userId)
      )
      .map(({ workspaceId: _ws, ...row }) => row);
  }
}
