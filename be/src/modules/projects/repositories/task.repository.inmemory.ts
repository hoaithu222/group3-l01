import { newObjectId } from "../../../core/utils/object-id";
import type { BoardTaskCounts, ColumnKindValue } from "../entities/board.interface";
import type {
  AdjacentDirection,
  ReviewStateValue,
  Task,
  TaskCreateInput,
  TaskListFilter,
  TaskMoveSet,
  TaskPatchSet,
  TaskRescheduleSet,
  TaskRestoreSet,
} from "../entities/task.interface";
import type { ITaskRepository } from "./task.repository.interface";
import type { TxContext } from "./unit-of-work";

const byPosition = (a: Task, b: Task): number =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function matches(t: Task, f: TaskListFilter, now: Date): boolean {
  if (f.assigneeId && !t.assigneeIds.includes(f.assigneeId)) return false;
  if (f.labelId && !t.labelIds.includes(f.labelId)) return false;
  if (f.q && !t.normalizedTitle.includes(f.q)) return false;
  if (f.overdue && !(t.dueDate !== null && t.dueDate < now && t.columnKind !== "DONE")) return false;
  if (f.dueBefore && !f.overdue && !(t.dueDate !== null && t.dueDate <= f.dueBefore)) return false;
  return true;
}

/** Bản sao trả ra ngoài: `checklist` đã sắp theo `order` (hợp đồng của `ITaskRepository`, giống `mapTask` của bản Prisma). */
function out(t: Task): Task {
  const copy = structuredClone(t);
  copy.checklist.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return copy;
}

/** Repository in-memory cho unit test — mô phỏng CAS theo `version` và thứ tự `(position, id)`. */
export class InMemoryTaskRepository implements ITaskRepository {
  readonly tasks = new Map<string, Task>();

  private live(boardId: string, columnId: string, excludeId?: string): Task[] {
    return [...this.tasks.values()].filter(
      (t) => t.boardId === boardId && t.columnId === columnId && t.deletedAt === null && t.id !== excludeId
    );
  }

  async findById(id: string, _tx?: TxContext): Promise<Task | null> {
    const t = this.tasks.get(id);
    return t ? out(t) : null;
  }

  async findLiveByIds(ids: string[]): Promise<Task[]> {
    return ids.flatMap((id) => {
      const t = this.tasks.get(id);
      return t && t.deletedAt === null ? [out(t)] : [];
    });
  }

  async create(input: TaskCreateInput): Promise<Task> {
    const now = new Date();
    const { description, startDate, storyPoints, checklist, ...base } = input;
    const task: Task = {
      id: newObjectId(),
      ...base,
      description: description ?? null,
      startDate: startDate ?? null,
      storyPoints: storyPoints ?? null,
      checklist: structuredClone(checklist ?? []),
      checklistDone: 0,
      checklistTotal: checklist?.length ?? 0,
      attachmentCount: 0,
      commentCount: 0,
      reviewState: "NONE",
      deletedFromColumnId: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, structuredClone(task));
    return task;
  }

  async findByClientTaskId(boardId: string, createdBy: string, clientTaskId: string): Promise<Task | null> {
    const t = [...this.tasks.values()].find(
      (x) => x.boardId === boardId && x.createdBy === createdBy && x.clientTaskId === clientTaskId && x.deletedAt === null
    );
    return t ? out(t) : null;
  }

  async countLive(boardId: string): Promise<number> {
    return [...this.tasks.values()].filter((t) => t.boardId === boardId && t.deletedAt === null).length;
  }

  async countInColumn(boardId: string, columnId: string): Promise<number> {
    return this.live(boardId, columnId).length;
  }

  async lastPosition(boardId: string, columnId: string, excludeId?: string): Promise<string | null> {
    const rows = this.live(boardId, columnId, excludeId).sort(byPosition);
    return rows.length > 0 ? rows[rows.length - 1].position : null;
  }

  async adjacent(
    boardId: string,
    columnId: string,
    position: string,
    direction: AdjacentDirection,
    excludeId?: string
  ): Promise<Task | null> {
    const rows = this.live(boardId, columnId, excludeId).sort(byPosition);
    const found = direction === "after" ? rows.find((t) => t.position > position) : [...rows].reverse().find((t) => t.position < position);
    return found ? out(found) : null;
  }

  async moveCas(id: string, expectedVersion: number, set: TaskMoveSet): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null || t.version !== expectedVersion) return null;
    Object.assign(t, { ...set, version: t.version + 1, updatedAt: new Date() });
    return out(t);
  }

  async patchCas(id: string, expectedVersion: number, set: TaskPatchSet): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null || t.version !== expectedVersion) return null;
    const defined = Object.fromEntries(Object.entries(structuredClone(set)).filter(([, v]) => v !== undefined));
    Object.assign(t, defined, { version: t.version + 1, updatedAt: new Date() });
    return out(t);
  }

  async applyReschedule(id: string, expectedVersion: number, set: TaskRescheduleSet): Promise<boolean> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null || t.columnKind === "DONE" || t.version !== expectedVersion) return false;
    t.startDate = set.startDate ? new Date(set.startDate) : null;
    t.dueDate = set.dueDate ? new Date(set.dueDate) : null;
    if (set.bumpDueVersion) t.dueVersion += 1;
    t.version += 1;
    t.updatedAt = new Date();
    return true;
  }

  async softDeleteCas(
    id: string,
    expectedVersion: number,
    set: { deletedAt: Date; deletedBy: string; deletedFromColumnId: string }
  ): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null || t.version !== expectedVersion) return null;
    Object.assign(t, set, { version: t.version + 1, updatedAt: new Date() });
    return out(t);
  }

  async restoreCas(id: string, expectedVersion: number, set: TaskRestoreSet): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt === null || t.version !== expectedVersion) return null;
    Object.assign(t, set, { deletedAt: null, deletedBy: null, deletedFromColumnId: null, version: t.version + 1, updatedAt: new Date() });
    return out(t);
  }

  async bumpAttachmentCount(id: string, delta: 1 | -1, max: number): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null) return null;
    if (delta === 1 ? t.attachmentCount >= max : t.attachmentCount <= 0) return null;
    t.attachmentCount += delta;
    t.version += 1;
    t.updatedAt = new Date();
    return out(t);
  }

  async bumpCommentCount(id: string, delta: 1 | -1): Promise<Task | null> {
    const t = this.tasks.get(id);
    if (!t || t.deletedAt !== null) return null;
    if (delta === -1 && t.commentCount <= 0) return null;
    t.commentCount += delta;
    return out(t);
  }

  async listColumn(boardId: string, columnId: string, filter: TaskListFilter, limit: number, now: Date): Promise<Task[]> {
    return this.live(boardId, columnId)
      .filter((t) => matches(t, filter, now))
      .sort(byPosition)
      .slice(0, limit)
      .map((t) => out(t));
  }

  async listColumnAll(boardId: string, columnId: string): Promise<Task[]> {
    return this.live(boardId, columnId).sort(byPosition).map((t) => out(t));
  }

  async updatePositions(items: { id: string; position: string }[]): Promise<number> {
    let changed = 0;
    for (const item of items) {
      const t = this.tasks.get(item.id);
      if (t) {
        t.position = item.position;
        changed += 1;
      }
    }
    return changed;
  }

  async setColumnKind(boardId: string, columnId: string, kind: TaskMoveSet["columnKind"]): Promise<number> {
    const rows = [...this.tasks.values()].filter((t) => t.boardId === boardId && t.columnId === columnId);
    for (const t of rows) t.columnKind = kind;
    return rows.length;
  }

  async countsByBoard(boardIds: string[]): Promise<Map<string, BoardTaskCounts>> {
    const result = new Map<string, BoardTaskCounts>();
    for (const id of boardIds) result.set(id, { byColumn: new Map(), total: 0 });
    for (const t of this.tasks.values()) {
      const entry = result.get(t.boardId);
      if (!entry || t.deletedAt !== null) continue;
      entry.byColumn.set(t.columnId, (entry.byColumn.get(t.columnId) ?? 0) + 1);
      entry.total += 1;
    }
    return result;
  }

  async pullLabel(boardId: string, labelId: string): Promise<string[]> {
    const affected = [...this.tasks.values()].filter((t) => t.boardId === boardId && t.labelIds.includes(labelId));
    for (const t of affected) t.labelIds = t.labelIds.filter((l) => l !== labelId);
    return affected.filter((t) => t.deletedAt === null).map((t) => t.id);
  }

  async countWithLabel(boardId: string, labelId: string): Promise<number> {
    return [...this.tasks.values()].filter((t) => t.boardId === boardId && t.deletedAt === null && t.labelIds.includes(labelId)).length;
  }

  async setReviewState(id: string, state: ReviewStateValue): Promise<boolean> {
    const t = this.tasks.get(id);
    if (!t) return false;
    t.reviewState = state;
    return true;
  }

  async listLiveByKind(boardId: string, kind: ColumnKindValue, afterId: string | null, limit: number): Promise<Task[]> {
    return [...this.tasks.values()]
      .filter((t) => t.boardId === boardId && t.columnKind === kind && t.deletedAt === null && (afterId === null || t.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit)
      .map(out);
  }
}
