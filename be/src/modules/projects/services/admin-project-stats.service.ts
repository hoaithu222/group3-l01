import { NotFoundError } from "../../../core/exceptions";
import type { ColumnKindValue } from "../../../core/constants/project";
import type { IProjectStatsRepository } from "../repositories/project-stats.repository.interface";

const DAY_MS = 86_400_000;
const WEEKS = 8;
/** Trần bản ghi đọc để đếm theo tuần (56 ngày hoàn thành của một nhóm — dư sức, chặn trường hợp bất thường). */
const COMPLETED_SCAN_LIMIT = 50_000;

type ByKind = Record<ColumnKindValue, number>;

export interface ProjectStatsDto {
  boards: { id: string; name: string; archived: boolean; columnCount: number; byKind: ByKind; updatedAt: string }[];
  totals: { boards: number; archivedBoards: number; tasks: number; done30d: number; overdue: number };
  doneByWeek: { weekStart: string; count: number }[];
}

const emptyKinds = (): ByKind => ({ TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 });

/** Thứ Hai 00:00 UTC của tuần chứa `d`. */
export function weekStartUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/**
 * `GET /admin/workspaces/:id/project-stats` — số liệu dự án của một nhóm cho admin (admin.md §3). Chỉ đếm; tên bảng
 * là metadata tổ chức nên được hiện, tiêu đề/mô tả thẻ thì KHÔNG. Tuần tính theo UTC (chưa có `Workspace.timezone`).
 */
export class AdminProjectStatsService {
  constructor(private readonly stats: IProjectStatsRepository) {}

  async get(workspaceId: string, now: Date = new Date()): Promise<ProjectStatsDto> {
    if (!(await this.stats.workspaceExists(workspaceId))) throw new NotFoundError("Không tìm thấy nhóm");

    const firstWeek = weekStartUtc(new Date(now.getTime() - (WEEKS - 1) * 7 * DAY_MS));
    const [boards, kindCounts, overdue, completed] = await Promise.all([
      this.stats.listBoards(workspaceId),
      this.stats.countByBoardAndKind(workspaceId),
      this.stats.countOverdue(workspaceId, now),
      this.stats.completedSince(workspaceId, firstWeek, COMPLETED_SCAN_LIMIT),
    ]);

    const byBoard = new Map<string, ByKind>();
    for (const row of kindCounts) {
      const kinds = byBoard.get(row.boardId) ?? emptyKinds();
      kinds[row.kind] += row.count;
      byBoard.set(row.boardId, kinds);
    }

    const buckets = new Map<string, number>();
    for (let i = 0; i < WEEKS; i++) buckets.set(new Date(firstWeek.getTime() + i * 7 * DAY_MS).toISOString().slice(0, 10), 0);
    for (const at of completed) {
      const key = weekStartUtc(at).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const since30d = now.getTime() - 30 * DAY_MS;

    return {
      boards: boards.map((b) => ({
        id: b.id,
        name: b.name,
        archived: b.archivedAt !== null,
        columnCount: b.columnCount,
        byKind: byBoard.get(b.id) ?? emptyKinds(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      totals: {
        boards: boards.filter((b) => b.archivedAt === null).length,
        archivedBoards: boards.filter((b) => b.archivedAt !== null).length,
        tasks: kindCounts.reduce((sum, r) => sum + r.count, 0),
        done30d: completed.filter((at) => at.getTime() >= since30d).length,
        overdue,
      },
      doneByWeek: [...buckets].map(([weekStart, count]) => ({ weekStart, count })),
    };
  }
}
