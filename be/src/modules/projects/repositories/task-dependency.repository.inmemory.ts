import { newObjectId } from "../../../core/utils/object-id";
import type { Task } from "../entities/task.interface";
import {
  DuplicateDependencyError,
  type ITaskDependencyRepository,
  type TaskDependency,
  type TaskDependencyCreateInput,
} from "./task-dependency.repository.interface";
import type { InMemoryTaskRepository } from "./task.repository.inmemory";

type Edge = Pick<TaskDependency, "predecessorId" | "successorId">;

const pair = (e: TaskDependency): Edge => ({ predecessorId: e.predecessorId, successorId: e.successorId });

/**
 * Bản in-memory dùng CHUNG kho `InMemoryTaskRepository.tasks` (giống `InMemoryTaskChecklistRepository`) — mô phỏng unique
 * `(predecessorId, successorId)` bằng `DuplicateDependencyError`. KHÔNG có rollback (đơn vị công việc giả chạy thẳng `fn`).
 */
export class InMemoryTaskDependencyRepository implements ITaskDependencyRepository {
  readonly edges: TaskDependency[] = [];

  constructor(private readonly store: InMemoryTaskRepository) {}

  private live(id: string): Task | null {
    const t = this.store.tasks.get(id);
    return t && t.deletedAt === null ? t : null;
  }

  private open(id: string): boolean {
    const t = this.live(id);
    return t !== null && t.columnKind !== "DONE";
  }

  private counts(taskId: string): { blockedByCount: number; blockingCount: number } {
    return {
      blockedByCount: this.edges.filter((e) => e.successorId === taskId && this.open(e.predecessorId)).length,
      blockingCount: this.edges.filter((e) => e.predecessorId === taskId && this.open(e.successorId)).length,
    };
  }

  async find(predecessorId: string, successorId: string): Promise<TaskDependency | null> {
    const e = this.edges.find((x) => x.predecessorId === predecessorId && x.successorId === successorId);
    return e ? structuredClone(e) : null;
  }

  async countPredecessors(successorId: string): Promise<number> {
    return this.edges.filter((e) => e.successorId === successorId).length;
  }

  async countSuccessors(predecessorId: string): Promise<number> {
    return this.edges.filter((e) => e.predecessorId === predecessorId).length;
  }

  async outgoing(predecessorIds: string[], limit: number): Promise<Edge[]> {
    return this.edges.filter((e) => predecessorIds.includes(e.predecessorId)).slice(0, limit).map(pair);
  }

  async incoming(successorIds: string[], limit: number): Promise<Edge[]> {
    return this.edges.filter((e) => successorIds.includes(e.successorId)).slice(0, limit).map(pair);
  }

  async listForTask(taskId: string): Promise<{ predecessors: TaskDependency[]; successors: TaskDependency[] }> {
    const newestFirst = (a: TaskDependency, b: TaskDependency): number => b.createdAt.getTime() - a.createdAt.getTime();
    return {
      predecessors: this.edges.filter((e) => e.successorId === taskId).sort(newestFirst).map((e) => structuredClone(e)),
      successors: this.edges.filter((e) => e.predecessorId === taskId).sort(newestFirst).map((e) => structuredClone(e)),
    };
  }

  async create(input: TaskDependencyCreateInput): Promise<TaskDependency> {
    if (this.edges.some((e) => e.predecessorId === input.predecessorId && e.successorId === input.successorId)) {
      throw new DuplicateDependencyError();
    }
    const edge: TaskDependency = { id: newObjectId(), ...input, type: "FINISH_TO_START", createdAt: new Date() };
    this.edges.push(edge);
    return structuredClone(edge);
  }

  async delete(predecessorId: string, successorId: string): Promise<number> {
    const before = this.edges.length;
    const kept = this.edges.filter((e) => !(e.predecessorId === predecessorId && e.successorId === successorId));
    this.edges.splice(0, this.edges.length, ...kept);
    return before - this.edges.length;
  }

  async recount(taskId: string): Promise<Task | null> {
    const t = this.live(taskId);
    if (!t) return null;
    Object.assign(t, this.counts(taskId));
    t.version += 1;
    t.updatedAt = new Date();
    return structuredClone(t);
  }

  async recountIfChanged(taskId: string): Promise<Task | null> {
    const t = this.live(taskId);
    if (!t) return null;
    const next = this.counts(taskId);
    if ((t.blockedByCount ?? 0) === next.blockedByCount && (t.blockingCount ?? 0) === next.blockingCount) return null;
    Object.assign(t, next);
    t.version += 1;
    t.updatedAt = new Date();
    return structuredClone(t);
  }

  async boardTasksInRange(boardId: string, from: Date, to: Date, limit: number): Promise<Task[]> {
    return [...this.store.tasks.values()]
      .filter((t) => {
        if (t.boardId !== boardId || t.deletedAt !== null) return false;
        const start = t.startDate ?? t.dueDate;
        const end = t.dueDate ?? t.startDate;
        return !!start && !!end && start <= to && end >= from;
      })
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map((t) => structuredClone(t));
  }

  async edgesAmong(ids: string[]): Promise<Edge[]> {
    return this.edges.filter((e) => ids.includes(e.predecessorId) && ids.includes(e.successorId)).map(pair);
  }

  async liveTasks(ids: string[]): Promise<Task[]> {
    return ids.flatMap((id) => {
      const t = this.live(id);
      return t ? [structuredClone(t)] : [];
    });
  }

  async boardIdsWithEdges(afterBoardId: string | null, limit: number): Promise<string[]> {
    return [...new Set(this.edges.map((e) => e.boardId))]
      .filter((id) => afterBoardId === null || id > afterBoardId)
      .sort()
      .slice(0, limit);
  }

  async edgesOfBoard(boardId: string, limit: number): Promise<Edge[]> {
    return this.edges.filter((e) => e.boardId === boardId).slice(0, limit).map(pair);
  }

  async tasksWithNonZeroCounts(boardId: string): Promise<Task[]> {
    return [...this.store.tasks.values()]
      .filter((t) => t.boardId === boardId && t.deletedAt === null && ((t.blockedByCount ?? 0) > 0 || (t.blockingCount ?? 0) > 0))
      .map((t) => structuredClone(t));
  }
}
