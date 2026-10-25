import { newObjectId } from "../../../core/utils/object-id";
import type { WellbeingShareEntity } from "../entities/burnout.interface";
import type { IWellbeingShareRepository } from "./share.repository.interface";
import type { TxHandle } from "./tx";

/** Bản test của `IWellbeingShareRepository` — khoá `${userId}|${workspaceId}` (cùng ngữ nghĩa unique index của Prisma). */
export class InMemoryWellbeingShareRepository implements IWellbeingShareRepository {
  readonly rows = new Map<string, WellbeingShareEntity>();

  private key(userId: string, workspaceId: string): string {
    return `${userId}|${workspaceId}`;
  }

  listByUser(userId: string): Promise<WellbeingShareEntity[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({ ...r }))
    );
  }

  find(userId: string, workspaceId: string): Promise<WellbeingShareEntity | null> {
    const row = this.rows.get(this.key(userId, workspaceId));
    return Promise.resolve(row ? { ...row } : null);
  }

  upsert(userId: string, workspaceId: string, now: Date): Promise<WellbeingShareEntity> {
    const key = this.key(userId, workspaceId);
    const existing = this.rows.get(key);
    const next: WellbeingShareEntity = existing ?? { id: newObjectId(), userId, workspaceId, createdAt: now };
    this.rows.set(key, next);
    return Promise.resolve({ ...next });
  }

  remove(userId: string, workspaceId: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(this.key(userId, workspaceId)));
  }

  listUserIdsByWorkspace(workspaceId: string): Promise<string[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.workspaceId === workspaceId).map((r) => r.userId));
  }

  deleteByUser(userId: string, _tx?: TxHandle): Promise<number> {
    let removed = 0;
    for (const [key, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}
