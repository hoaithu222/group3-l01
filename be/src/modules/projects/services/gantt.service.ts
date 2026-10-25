import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { diffLocalDates, localDate } from "../../../core/utils/local-date";
import type { ColumnKindValue } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { DependencyEdge } from "./dependency-graph";
import { STATIC_DEPENDENCY_LIMITS, type IDependencyLimits } from "./dependency-limits";
import type { ProjectAccess } from "./project-access";

export interface GanttTaskDto {
  id: string;
  title: string;
  /** Cột hiện tại của thẻ — app nhóm hàng theo cột (`columnKind` chỉ là loại cột). Khoá cột do bảng khai (`Board.columns[].id`). */
  columnId: string;
  columnKind: ColumnKindValue;
  startDate: string | null;
  dueDate: string | null;
  assigneeIds: string[];
  blockedByCount: number;
  slackDays: number | null;
  isCritical: boolean;
  conflict: boolean;
}

export interface GanttDto {
  timezone: string;
  from: string;
  to: string;
  truncated: boolean;
  tasks: GanttTaskDto[];
  edges: { predecessorId: string; successorId: string; slackDays: number | null }[];
}

/**
 * Tính slack THUẦN (p4-04 be.md §5.7) — "đường găng theo ngày thực tế, không phải CPM đầy đủ". Cạnh `T → S` (S chưa DONE,
 * T có hạn): `edgeSlack = ngày(S.start ?? S.due) − ngày(T.due) − 1`; `slackDays(T) = min(edgeSlack)` cạnh ra.
 */
export function computeGantt(tasks: Task[], edges: DependencyEdge[], tz: string): Pick<GanttDto, "tasks" | "edges"> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const slackOf = (e: DependencyEdge): number | null => {
    const t = byId.get(e.predecessorId);
    const s = byId.get(e.successorId);
    const anchor = s ? (s.startDate ?? s.dueDate) : null;
    if (!t?.dueDate || !s || s.columnKind === "DONE" || !anchor) return null;
    return diffLocalDates(localDate(t.dueDate, tz), localDate(anchor, tz)) - 1;
  };
  const edgeDtos = edges.map((e) => ({ predecessorId: e.predecessorId, successorId: e.successorId, slackDays: slackOf(e) }));
  const minOut = new Map<string, number>();
  const critical = new Set<string>();
  for (const e of edgeDtos) {
    if (e.slackDays === null) continue;
    minOut.set(e.predecessorId, Math.min(minOut.get(e.predecessorId) ?? Infinity, e.slackDays));
    if (e.slackDays <= 0) {
      critical.add(e.predecessorId);
      critical.add(e.successorId);
    }
  }
  return {
    edges: edgeDtos,
    tasks: tasks.map((t) => {
      const slack = minOut.get(t.id) ?? null;
      return {
        id: t.id,
        title: t.title,
        columnId: t.columnId,
        columnKind: t.columnKind,
        startDate: t.startDate ? t.startDate.toISOString() : null,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assigneeIds: t.assigneeIds,
        blockedByCount: t.blockedByCount ?? 0,
        slackDays: slack,
        isCritical: critical.has(t.id),
        conflict: slack !== null && slack < 0,
      };
    }),
  };
}

/** (P1) `GET /boards/:id/gantt` — chỉ đọc. */
export class GanttService {
  constructor(
    private readonly d: {
      access: ProjectAccess;
      dependencies: ITaskDependencyRepository;
      /** Múi giờ tính "ngày" của NHÓM chứa bảng (`Workspace.timezone` → mặc định hệ thống). */
      timezone: (workspaceId: string) => Promise<string>;
      /** Giới hạn hiệu lực (mặc định `LIMITS.gantt`; container truyền bản đọc `SystemConfig`). */
      limits?: IDependencyLimits;
    }
  ) {}

  async get(user: AuthUser, boardId: string, range: { from: Date; to: Date }): Promise<GanttDto> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.read");
    const limits = await (this.d.limits ?? STATIC_DEPENDENCY_LIMITS).load();
    // DTO chỉ kiểm TRẦN CỨNG; admin có thể HẠ khoảng tối đa qua SystemConfig `limits.gantt` nên service kiểm lại giá trị hiệu lực.
    if ((range.to.getTime() - range.from.getTime()) / 86_400_000 > limits.ganttRangeMaxDays) {
      throw new ValidationError("Khoảng ngày không hợp lệ", { to: [`Tối đa ${limits.ganttRangeMaxDays} ngày`] });
    }
    const tz = await this.d.timezone(board.workspaceId);
    const max = limits.ganttTasksMax;
    const loaded = await this.d.dependencies.boardTasksInRange(boardId, range.from, range.to, max + 1);
    const tasks = loaded.slice(0, max);
    const edges = await this.d.dependencies.edgesAmong(tasks.map((t) => t.id));
    return {
      timezone: tz,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      truncated: loaded.length > max,
      ...computeGantt(tasks, edges, tz),
    };
  }
}
