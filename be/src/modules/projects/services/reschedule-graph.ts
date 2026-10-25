import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Task } from "../entities/task.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { DependencyEdge } from "./dependency-graph";
import { boardEdgeLoader } from "./dependency-edge-loader";
import type { PlannerTask } from "./reschedule-planner";

/** Lô tải thẻ khi dựng đồ thị (be.md §5.3). */
const TASK_BATCH = 500;

/** `409 TASK_021` — chuỗi phụ thuộc vượt trần khi dựng đồ thị/lập kế hoạch. */
export const tooLargeError = (): AppError => new AppError(ErrorMessages[ErrorCode.TASK_021], 409, ErrorCode.TASK_021);

export function toPlannerTask(t: Task): PlannerTask {
  return {
    id: t.id,
    version: t.version,
    title: t.title,
    startDate: t.startDate,
    dueDate: t.dueDate,
    columnKind: t.columnKind,
    deletedAt: t.deletedAt,
    assigneeIds: t.assigneeIds,
  };
}

/**
 * Cạnh ra đạt được từ thẻ nguồn (BFS theo lô) + cạnh vào của các đỉnh đó (thẻ trước nằm ngoài đồ thị con), rồi tải thẻ theo
 * lô 500. Tổng cạnh > `visitMax` → `TASK_021`. Thẻ KHÔNG tải được (đã xoá) ⇒ planner coi là DELETED; thẻ khác bảng bị bỏ.
 * CHỈ ĐỌC — dùng chung cho preview, áp dời lịch và `ReschedulePolicy` của PATCH.
 */
export async function loadRescheduleGraph(
  repo: ITaskDependencyRepository,
  source: Task,
  visitMax: number
): Promise<{ tasks: Map<string, PlannerTask>; edges: DependencyEdge[] }> {
  const loader = boardEdgeLoader(repo, source.boardId);
  const edges: DependencyEdge[] = [];
  const reached = new Set<string>([source.id]);
  let frontier = [source.id];
  while (frontier.length > 0) {
    const batch = await loader.outgoing(frontier, visitMax - edges.length + 1);
    edges.push(...batch);
    if (edges.length > visitMax) throw tooLargeError();
    frontier = [];
    for (const e of batch) {
      if (reached.has(e.successorId)) continue;
      reached.add(e.successorId);
      frontier.push(e.successorId);
    }
  }
  const seenEdge = new Set(edges.map((e) => `${e.predecessorId}>${e.successorId}`));
  const inc = await loader.incoming([...reached], visitMax - edges.length + 1);
  for (const e of inc) {
    const key = `${e.predecessorId}>${e.successorId}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push(e);
  }
  if (edges.length > visitMax) throw tooLargeError();

  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.predecessorId);
    ids.add(e.successorId);
  }
  ids.delete(source.id);
  const tasks = new Map<string, PlannerTask>([[source.id, toPlannerTask(source)]]);
  const list = [...ids];
  for (let i = 0; i < list.length; i += TASK_BATCH) {
    for (const t of await repo.liveTasks(list.slice(i, i + TASK_BATCH))) {
      if (t.boardId === source.boardId) tasks.set(t.id, toPlannerTask(t));
    }
  }
  return { tasks, edges };
}
