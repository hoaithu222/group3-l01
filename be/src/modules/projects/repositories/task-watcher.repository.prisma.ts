import { Prisma } from "@prisma/client";
import type { TaskWatchState } from "../../../core/constants/project";
import type { ExplicitWatchState, TaskWatcher } from "../entities/task-watcher.interface";
import { db } from "./prisma-tx";
import type { ITaskWatcherRepository } from "./task-watcher.repository.interface";

type Row = Prisma.TaskWatcherGetPayload<Record<string, never>>;

const toEntity = (r: Row): TaskWatcher => ({ taskId: r.taskId, userId: r.userId, state: r.state as TaskWatchState, updatedAt: r.updatedAt });
const isDuplicate = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Không mở transaction (mỗi lệnh độc lập): unique `(taskId, userId)` chốt đua tạo lần đầu; thua đua ⇒ hàng đã có nên ghi đè/bỏ qua an toàn.
 * (Không bao giờ `upsert` — hai lệnh upsert cùng khoá MỚI cho P2002 không tự thử lại trên Mongo.)
 */
export class PrismaTaskWatcherRepository implements ITaskWatcherRepository {
  async find(taskId: string, userId: string): Promise<TaskWatcher | null> {
    const r = await db().taskWatcher.findFirst({ where: { taskId, userId } });
    return r ? toEntity(r) : null;
  }

  async listByTask(taskId: string, limit: number): Promise<TaskWatcher[]> {
    const rows = await db().taskWatcher.findMany({ where: { taskId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: limit });
    return rows.map(toEntity);
  }

  async setExplicit(taskId: string, userId: string, state: ExplicitWatchState): Promise<TaskWatcher> {
    const updated = await db().taskWatcher.updateMany({ where: { taskId, userId }, data: { state } });
    if (updated.count === 0) {
      try {
        await db().taskWatcher.create({ data: { taskId, userId, state } });
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        await db().taskWatcher.updateMany({ where: { taskId, userId }, data: { state } });
      }
    }
    const row = await db().taskWatcher.findFirst({ where: { taskId, userId } });
    if (!row) throw new Error("TaskWatcher biến mất ngay sau khi ghi");
    return toEntity(row);
  }

  async ensureAuto(taskId: string, userIds: string[]): Promise<number> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return 0;
    const have = new Set((await db().taskWatcher.findMany({ where: { taskId, userId: { in: ids } }, select: { userId: true } })).map((r) => r.userId));
    let created = 0;
    for (const userId of ids.filter((id) => !have.has(id))) {
      try {
        await db().taskWatcher.create({ data: { taskId, userId, state: "AUTO_ON" } });
        created += 1;
      } catch (err) {
        if (!isDuplicate(err)) throw err; // người khác vừa tạo ⇒ giữ nguyên lựa chọn của họ
      }
    }
    return created;
  }
}
