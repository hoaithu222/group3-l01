import type { ExplicitWatchState, TaskWatcher } from "../entities/task-watcher.interface";
import type { ITaskWatcherRepository } from "./task-watcher.repository.interface";

/** Repository in-memory cho unit test — mô phỏng unique `(taskId, userId)` bằng khoá Map. */
export class InMemoryTaskWatcherRepository implements ITaskWatcherRepository {
  readonly rows = new Map<string, TaskWatcher>();
  private tick = 0;
  private readonly key = (taskId: string, userId: string): string => `${taskId}:${userId}`;

  async find(taskId: string, userId: string): Promise<TaskWatcher | null> {
    const r = this.rows.get(this.key(taskId, userId));
    return r ? { ...r } : null;
  }

  async listByTask(taskId: string, limit: number): Promise<TaskWatcher[]> {
    return [...this.rows.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async setExplicit(taskId: string, userId: string, state: ExplicitWatchState): Promise<TaskWatcher> {
    const row: TaskWatcher = { taskId, userId, state, updatedAt: new Date(Date.now() + this.tick++) };
    this.rows.set(this.key(taskId, userId), row);
    return { ...row };
  }

  async ensureAuto(taskId: string, userIds: string[]): Promise<number> {
    let created = 0;
    for (const userId of new Set(userIds)) {
      if (this.rows.has(this.key(taskId, userId))) continue;
      this.rows.set(this.key(taskId, userId), { taskId, userId, state: "AUTO_ON", updatedAt: new Date(Date.now() + this.tick++) });
      created += 1;
    }
    return created;
  }
}
