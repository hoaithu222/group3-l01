import type { Prisma } from "@prisma/client";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { ChecklistItem, Task } from "../entities/task.interface";
import type { ChecklistAddResult, ChecklistWrite, ITaskChecklistRepository } from "./task-checklist.repository.interface";
import { db } from "./prisma-tx";
import { mapTask } from "./task.repository.prisma";

/** Extended JSON (mongo shell) — `$runCommandRaw` KHÔNG tự đổi kiểu như Prisma Client. */
const oid = (id: string) => ({ $oid: id });
const date = (d: Date) => ({ $date: d.toISOString() });

const REMOVE_ATTEMPTS = 5;

/** `$runCommandRaw` KHÔNG ném khi lệnh ghi lỗi từng dòng — lỗi nằm ở `writeErrors` của phản hồi. */
function matchedCount(result: Prisma.JsonObject): number {
  const errors = result["writeErrors"];
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as { errmsg?: string };
    throw new Error(`Lệnh ghi thô lên Task.checklist thất bại: ${first.errmsg ?? JSON.stringify(first)}`);
  }
  return Number(result["n"] ?? 0);
}

const itemDoc = (i: ChecklistItem) => ({
  id: i.id,
  text: i.text,
  done: i.done,
  doneBy: i.doneBy ? oid(i.doneBy) : null,
  doneAt: i.doneAt ? date(i.doneAt) : null,
  order: i.order,
});

/**
 * Checklist nhúng theo TỪNG MỤC qua `$runCommandRaw` + `arrayFilters` (Prisma Client không có). Mọi lệnh là `update` một
 * tài liệu ⇒ nguyên tử mà không cần transaction: hai người sửa hai mục khác nhau không đụng độ (khác với CAS `version`).
 * ⚠️ Cần test tích hợp trên Mongo thật (`tests/integration/task-checklist.concurrency.test.ts`), không chỉ in-memory.
 */
export class PrismaTaskChecklistRepository implements ITaskChecklistRepository {
  private async update(taskId: string, q: Prisma.InputJsonObject, u: Prisma.InputJsonObject, arrayFilters?: Prisma.InputJsonObject[]): Promise<number> {
    const result = await db().$runCommandRaw({
      update: "Task",
      updates: [{ q: { _id: oid(taskId), deletedAt: null, ...q }, u, ...(arrayFilters && { arrayFilters }) }],
    });
    return matchedCount(result);
  }

  private async load(taskId: string): Promise<Task | null> {
    const r = await db().task.findUnique({ where: { id: taskId } });
    return r && r.deletedAt === null ? mapTask(r) : null;
  }

  async add(taskId: string, item: ChecklistItem, max: number): Promise<ChecklistAddResult> {
    const n = await this.update(
      taskId,
      { checklistTotal: { $lt: max } },
      { $push: { checklist: itemDoc(item) }, $inc: { checklistTotal: 1, version: 1 }, $set: { updatedAt: date(new Date()) } }
    );
    const task = await this.load(taskId);
    if (!task) return { status: "gone" };
    return { status: n > 0 ? "added" : "limit", task };
  }

  async setDone(taskId: string, itemId: string, done: boolean, by: string, at: Date): Promise<ChecklistWrite> {
    const n = await this.update(
      taskId,
      { checklist: { $elemMatch: { id: itemId, done: !done } } },
      {
        $set: {
          "checklist.$[i].done": done,
          "checklist.$[i].doneBy": done ? oid(by) : null,
          "checklist.$[i].doneAt": done ? date(at) : null,
          updatedAt: date(at),
        },
        $inc: { checklistDone: done ? 1 : -1, version: 1 },
      },
      [{ "i.id": itemId, "i.done": !done }]
    );
    return this.outcome(taskId, itemId, n > 0);
  }

  async edit(taskId: string, itemId: string, set: { text?: string; order?: number }): Promise<ChecklistWrite> {
    const n = await this.update(
      taskId,
      { "checklist.id": itemId },
      {
        $set: {
          ...(set.text !== undefined && { "checklist.$[i].text": set.text }),
          ...(set.order !== undefined && { "checklist.$[i].order": set.order }),
          updatedAt: date(new Date()),
        },
        $inc: { version: 1 },
      },
      [{ "i.id": itemId }]
    );
    return this.outcome(taskId, itemId, n > 0);
  }

  async remove(taskId: string, itemId: string): Promise<ChecklistWrite> {
    for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt++) {
      const before = await this.load(taskId);
      if (!before) return { status: "gone" };
      const item = before.checklist.find((i) => i.id === itemId);
      if (!item) return { status: "no-item", task: before };
      // Điều kiện kèm `done` hiện tại: tick đồng thời làm `done` đổi giữa lúc đọc và ghi → không khớp → đọc lại, thử lại.
      const n = await this.update(
        taskId,
        { checklist: { $elemMatch: { id: itemId, done: item.done } } },
        {
          $pull: { checklist: { id: itemId } },
          $inc: { checklistTotal: -1, checklistDone: item.done ? -1 : 0, version: 1 },
          $set: { updatedAt: date(new Date()) },
        }
      );
      if (n > 0) {
        const task = await this.load(taskId);
        return task ? { status: "changed", task, removed: item } : { status: "gone" };
      }
    }
    throw new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503, { retryable: true });
  }

  async renumber(taskId: string): Promise<Task | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const task = await this.load(taskId);
      if (!task) return null;
      const items = task.checklist.map((i, index) => ({ ...i, order: 1024 * (index + 1) }));
      // CAS theo `version`: lệnh checklist đồng thời đều tăng `version` nên không thể ghi đè mục vừa thêm.
      const res = await db().task.updateMany({
        where: { id: taskId, version: task.version, deletedAt: null },
        data: { checklist: { set: items }, version: { increment: 1 } },
      });
      if (res.count > 0) return this.load(taskId);
    }
    return this.load(taskId);
  }

  /** Sau một lệnh ghi: `changed` nếu khớp; ngược lại phân biệt thẻ không còn / mục không còn / đã đúng trạng thái. */
  private async outcome(taskId: string, itemId: string, changed: boolean): Promise<ChecklistWrite> {
    const task = await this.load(taskId);
    if (!task) return { status: "gone" };
    if (changed) return { status: "changed", task };
    return { status: task.checklist.some((i) => i.id === itemId) ? "unchanged" : "no-item", task };
  }
}
