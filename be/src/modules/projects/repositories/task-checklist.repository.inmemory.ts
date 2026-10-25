import type { ChecklistItem, Task } from "../entities/task.interface";
import type { ChecklistAddResult, ChecklistWrite, ITaskChecklistRepository } from "./task-checklist.repository.interface";
import type { InMemoryTaskRepository } from "./task.repository.inmemory";

const sorted = (items: ChecklistItem[]): ChecklistItem[] =>
  [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * Bản in-memory dùng CHUNG kho `InMemoryTaskRepository.tasks` — mô phỏng ngữ nghĩa nguyên tử của lệnh Mongo (mỗi hàm chạy
 * đồng bộ từ đầu tới cuối trên MỘT thẻ). KHÔNG thay được test Mongo thật cho `arrayFilters` (xem be.md p3-03 §10).
 */
export class InMemoryTaskChecklistRepository implements ITaskChecklistRepository {
  constructor(private readonly store: InMemoryTaskRepository) {}

  private live(taskId: string): Task | null {
    const t = this.store.tasks.get(taskId);
    return t && t.deletedAt === null ? t : null;
  }

  private snapshot(t: Task): Task {
    return structuredClone({ ...t, checklist: sorted(t.checklist) });
  }

  private touch(t: Task): void {
    t.version += 1;
    t.updatedAt = new Date();
  }

  async add(taskId: string, item: ChecklistItem, max: number): Promise<ChecklistAddResult> {
    const t = this.live(taskId);
    if (!t) return { status: "gone" };
    if (t.checklistTotal >= max) return { status: "limit", task: this.snapshot(t) };
    t.checklist.push(structuredClone(item));
    t.checklistTotal += 1;
    this.touch(t);
    return { status: "added", task: this.snapshot(t) };
  }

  async setDone(taskId: string, itemId: string, done: boolean, by: string, at: Date): Promise<ChecklistWrite> {
    const t = this.live(taskId);
    if (!t) return { status: "gone" };
    const item = t.checklist.find((i) => i.id === itemId);
    if (!item) return { status: "no-item", task: this.snapshot(t) };
    if (item.done === done) return { status: "unchanged", task: this.snapshot(t) };
    Object.assign(item, { done, doneBy: done ? by : null, doneAt: done ? at : null });
    t.checklistDone += done ? 1 : -1;
    this.touch(t);
    return { status: "changed", task: this.snapshot(t) };
  }

  async edit(taskId: string, itemId: string, set: { text?: string; order?: number }): Promise<ChecklistWrite> {
    const t = this.live(taskId);
    if (!t) return { status: "gone" };
    const item = t.checklist.find((i) => i.id === itemId);
    if (!item) return { status: "no-item", task: this.snapshot(t) };
    if (set.text !== undefined) item.text = set.text;
    if (set.order !== undefined) item.order = set.order;
    this.touch(t);
    return { status: "changed", task: this.snapshot(t) };
  }

  async remove(taskId: string, itemId: string): Promise<ChecklistWrite> {
    const t = this.live(taskId);
    if (!t) return { status: "gone" };
    const item = t.checklist.find((i) => i.id === itemId);
    if (!item) return { status: "no-item", task: this.snapshot(t) };
    t.checklist = t.checklist.filter((i) => i.id !== itemId);
    t.checklistTotal -= 1;
    if (item.done) t.checklistDone -= 1;
    this.touch(t);
    return { status: "changed", task: this.snapshot(t), removed: structuredClone(item) };
  }

  async renumber(taskId: string): Promise<Task | null> {
    const t = this.live(taskId);
    if (!t) return null;
    t.checklist = sorted(t.checklist).map((i, index) => ({ ...i, order: 1024 * (index + 1) }));
    this.touch(t);
    return this.snapshot(t);
  }
}
