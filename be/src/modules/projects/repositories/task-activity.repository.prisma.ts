import type { Prisma } from "@prisma/client";
import { newObjectId } from "../../../core/utils/object-id";
import type { TaskActivity, TaskActivityInput } from "../entities/task.interface";
import type { ITaskActivityRepository, TaskActivityPage } from "./task-activity.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

const json = (v: Record<string, unknown> | null): Prisma.InputJsonValue | null =>
  v === null ? null : (v as Prisma.InputJsonValue);

type ActivityRecord = Prisma.TaskActivityGetPayload<Record<string, never>>;

const asObject = (v: Prisma.JsonValue | null): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function toEntity(r: ActivityRecord): TaskActivity {
  return {
    id: r.id,
    taskId: r.taskId,
    boardId: r.boardId,
    workspaceId: r.workspaceId,
    actorId: r.actorId ?? null,
    type: r.type,
    before: asObject(r.before),
    after: asObject(r.after),
    groupKey: r.groupKey ?? null,
    at: r.at,
  };
}

const ORDER = [{ at: "desc" }, { id: "desc" }] as const;

export class PrismaTaskActivityRepository implements ITaskActivityRepository {
  async create(input: TaskActivityInput, tx?: TxContext): Promise<TaskActivity> {
    const r = await db(tx).taskActivity.create({
      data: {
        taskId: input.taskId,
        boardId: input.boardId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: input.type,
        before: json(input.before) ?? undefined,
        after: json(input.after) ?? undefined,
        groupKey: input.groupKey,
      },
    });
    return { ...input, id: r.id, at: r.at };
  }

  async createMany(inputs: TaskActivityInput[], tx?: TxContext): Promise<TaskActivity[]> {
    if (inputs.length === 0) return [];
    // `createMany` của Mongo không trả id ⇒ cấp id + `at` phía client rồi ghi MỘT lệnh.
    const at = new Date();
    const rows = inputs.map((input) => ({ ...input, id: newObjectId(), at }));
    await db(tx).taskActivity.createMany({
      data: rows.map((r) => ({
        id: r.id,
        taskId: r.taskId,
        boardId: r.boardId,
        workspaceId: r.workspaceId,
        actorId: r.actorId,
        type: r.type,
        before: json(r.before) ?? undefined,
        after: json(r.after) ?? undefined,
        groupKey: r.groupKey,
        at: r.at,
      })),
    });
    return rows;
  }

  async findLatest(taskId: string, tx?: TxContext): Promise<TaskActivity | null> {
    const r = await db(tx).taskActivity.findFirst({ where: { taskId }, orderBy: [...ORDER] });
    return r ? toEntity(r) : null;
  }

  async updateGrouped(
    id: string,
    patch: { type: string; after: Record<string, unknown> | null },
    tx?: TxContext
  ): Promise<TaskActivity | null> {
    const client = db(tx);
    const res = await client.taskActivity.updateMany({
      where: { id },
      data: { type: patch.type, after: json(patch.after) ?? undefined },
    });
    if (res.count === 0) return null;
    const r = await client.taskActivity.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async list(taskId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<TaskActivityPage> {
    const rows = await db().taskActivity.findMany({
      where: {
        taskId,
        ...(cursor && { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] }),
      },
      orderBy: [...ORDER],
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map(toEntity), hasMore: rows.length > limit };
  }
}
