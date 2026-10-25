import { logger } from "../../../infrastructure/logger";
import type { Task } from "../entities/task.interface";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import { TaskPublisher } from "./task-publisher";

export interface DependencyCountsRebuildDeps {
  dependencies: ITaskDependencyRepository;
  emitter: IBoardEmitter;
  directory: IProjectDirectory;
  /** Số bảng mỗi trang khi duyệt (mặc định 50). */
  boardPageSize?: number;
}

export interface RebuildSummary {
  boards: number;
  fixed: number;
  failed: number;
}

/** Trần số cạnh đọc một bảng (bảng tối đa 5.000 thẻ × 50 phụ thuộc) — chỉ để tránh vòng lặp vô hạn khi dữ liệu hỏng. */
const EDGE_CAP = 250_000;
const TASK_BATCH = 500;

/**
 * Cron đối soát bộ đếm phụ thuộc (p4-04 be.md §5.8, `dependency-counts.rebuild` 02:30 hằng đêm). Với mỗi bảng có cạnh: dựng
 * `blockedByCount`/`blockingCount` kỳ vọng trong bộ nhớ từ cạnh + trạng thái thẻ, chỉ những thẻ LỆCH mới đếm lại từ DB
 * (`recountIfChanged` — đếm lại, không ±1 nên chạy lặp/đua với thao tác thật đều vô hại) và phát `task:updated` (`changed: ["dependencies"]`).
 * Cũng bắt thẻ còn bộ đếm > 0 nhưng cạnh đã mất (không có trong tập cạnh của bảng).
 */
export class DependencyCountsRebuildService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: DependencyCountsRebuildDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory);
  }

  /** Duyệt mọi bảng có cạnh theo trang; lỗi một bảng được ghi log và KHÔNG dừng cả job. */
  async rebuildAll(): Promise<RebuildSummary> {
    const summary: RebuildSummary = { boards: 0, fixed: 0, failed: 0 };
    const pageSize = this.d.boardPageSize ?? 50;
    let after: string | null = null;
    for (;;) {
      const boardIds: string[] = await this.d.dependencies.boardIdsWithEdges(after, pageSize);
      if (boardIds.length === 0) break;
      for (const boardId of boardIds) {
        summary.boards += 1;
        try {
          summary.fixed += await this.rebuildBoard(boardId);
        } catch (err) {
          summary.failed += 1;
          logger.error("[dependency-counts.rebuild] lỗi khi đối soát bảng", { boardId, error: err instanceof Error ? err.message : String(err) });
        }
      }
      after = boardIds[boardIds.length - 1];
      if (boardIds.length < pageSize) break;
    }
    return summary;
  }

  /** Trả số thẻ đã sửa bộ đếm. */
  async rebuildBoard(boardId: string): Promise<number> {
    const edges = await this.d.dependencies.edgesOfBoard(boardId, EDGE_CAP);
    const stale = await this.d.dependencies.tasksWithNonZeroCounts(boardId);
    const ids = new Set<string>(stale.map((t) => t.id));
    for (const e of edges) {
      ids.add(e.predecessorId);
      ids.add(e.successorId);
    }
    const tasks = new Map<string, Task>();
    const list = [...ids];
    for (let i = 0; i < list.length; i += TASK_BATCH) {
      for (const t of await this.d.dependencies.liveTasks(list.slice(i, i + TASK_BATCH))) tasks.set(t.id, t);
    }

    const open = (id: string): boolean => {
      const t = tasks.get(id);
      return t !== undefined && t.columnKind !== "DONE";
    };
    const blockedBy = new Map<string, number>();
    const blocking = new Map<string, number>();
    for (const e of edges) {
      if (open(e.predecessorId)) blockedBy.set(e.successorId, (blockedBy.get(e.successorId) ?? 0) + 1);
      if (open(e.successorId)) blocking.set(e.predecessorId, (blocking.get(e.predecessorId) ?? 0) + 1);
    }

    let fixed = 0;
    for (const t of tasks.values()) {
      if ((t.blockedByCount ?? 0) === (blockedBy.get(t.id) ?? 0) && (t.blockingCount ?? 0) === (blocking.get(t.id) ?? 0)) continue;
      const updated = await this.d.dependencies.recountIfChanged(t.id);
      if (!updated) continue;
      fixed += 1;
      await this.publisher.updated(updated, null, ["dependencies"]);
    }
    return fixed;
  }
}
