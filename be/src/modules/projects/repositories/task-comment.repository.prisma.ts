import { Prisma } from "@prisma/client";
import type {
  CommentMention,
  TaskComment,
  TaskCommentCreateInput,
  TaskCommentEditSet,
  TaskCommentPage,
  TaskCommentTombstone,
} from "../entities/task-comment.interface";
import { DuplicateCommentError, type ITaskCommentRepository } from "./task-comment.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type CommentRecord = Prisma.TaskCommentGetPayload<Record<string, never>>;

function toMentions(value: Prisma.JsonValue): CommentMention[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((m) => {
    const item = m as { type?: unknown; targetId?: unknown } | null;
    return item && item.type === "USER" && typeof item.targetId === "string"
      ? [{ type: "USER" as const, targetId: item.targetId }]
      : [];
  });
}

function toEntity(r: CommentRecord): TaskComment {
  return {
    id: r.id,
    taskId: r.taskId,
    boardId: r.boardId,
    workspaceId: r.workspaceId,
    authorId: r.authorId,
    clientCommentId: r.clientCommentId,
    content: r.content,
    mentions: toMentions(r.mentions),
    attachmentCount: r.attachmentCount,
    editedAt: r.editedAt ?? null,
    deletedAt: r.deletedAt ?? null,
    deletedBy: r.deletedBy ?? null,
    deleteReason: r.deleteReason ?? null,
    version: r.version,
    createdAt: r.createdAt,
  };
}

const LIVE = { deletedAt: null } as const;
const ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const;

export class PrismaTaskCommentRepository implements ITaskCommentRepository {
  async findById(id: string, tx?: TxContext): Promise<TaskComment | null> {
    const r = await db(tx).taskComment.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async findByClientId(authorId: string, clientCommentId: string, tx?: TxContext): Promise<TaskComment | null> {
    const r = await db(tx).taskComment.findFirst({ where: { authorId, clientCommentId } });
    return r ? toEntity(r) : null;
  }

  async create(input: TaskCommentCreateInput, tx: TxContext): Promise<TaskComment> {
    try {
      const r = await db(tx).taskComment.create({
        data: {
          id: input.id,
          taskId: input.taskId,
          boardId: input.boardId,
          workspaceId: input.workspaceId,
          authorId: input.authorId,
          clientCommentId: input.clientCommentId,
          content: input.content,
          mentions: input.mentions as unknown as Prisma.InputJsonValue,
          attachmentCount: input.attachmentCount,
          // Quy ước Mongo: mọi trường về sau lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
          editedAt: null,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
        },
      });
      return toEntity(r);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new DuplicateCommentError();
      throw err;
    }
  }

  async editCas(id: string, expectedVersion: number, set: TaskCommentEditSet, tx: TxContext): Promise<TaskComment | null> {
    const client = db(tx);
    const res = await client.taskComment.updateMany({
      where: { id, version: expectedVersion, ...LIVE },
      data: {
        content: set.content,
        mentions: set.mentions as unknown as Prisma.InputJsonValue,
        editedAt: set.editedAt,
        version: { increment: 1 },
      },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async tombstone(id: string, set: TaskCommentTombstone, tx: TxContext): Promise<TaskComment | null> {
    const res = await db(tx).taskComment.updateMany({
      where: { id, ...LIVE },
      data: { deletedAt: set.deletedAt, deletedBy: set.deletedBy, deleteReason: set.deleteReason, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async list(taskId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<TaskCommentPage> {
    const rows = await db().taskComment.findMany({
      where: {
        taskId,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }),
      },
      orderBy: [...ORDER],
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map(toEntity), hasMore: rows.length > limit };
  }
}
