import type { Prisma } from "@prisma/client";
import { escapeRegex } from "../../../core/utils/escape-regex";
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
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type TaskRecord = Prisma.TaskGetPayload<Record<string, never>>;

/** Sắp mục checklist theo `order` (hoà → theo `id`) để mọi nơi đọc `Task.checklist` thấy cùng một thứ tự. */
export function sortChecklist(items: Task["checklist"]): Task["checklist"] {
  return [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mapTask(r: TaskRecord): Task {
  return {
    id: r.id,
    boardId: r.boardId,
    workspaceId: r.workspaceId,
    columnId: r.columnId,
    columnKind: r.columnKind,
    position: r.position,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    description: r.description ?? null,
    assigneeIds: r.assigneeIds,
    labelIds: r.labelIds,
    startDate: r.startDate ?? null,
    dueDate: r.dueDate ?? null,
    storyPoints: r.storyPoints ?? null,
    checklist: sortChecklist(
      (r.checklist ?? []).map((i) => ({
        id: i.id,
        text: i.text,
        done: i.done,
        doneBy: i.doneBy ?? null,
        doneAt: i.doneAt ?? null,
        order: i.order,
      }))
    ),
    checklistDone: r.checklistDone,
    checklistTotal: r.checklistTotal,
    attachmentCount: r.attachmentCount,
    commentCount: r.commentCount,
    reviewState: r.reviewState,
    completedAt: r.completedAt ?? null,
    completionCount: r.completionCount,
    createdBy: r.createdBy,
    clientTaskId: r.clientTaskId ?? null,
    dueVersion: r.dueVersion,
    deletedFromColumnId: r.deletedFromColumnId ?? null,
    deletedAt: r.deletedAt ?? null,
    deletedBy: r.deletedBy ?? null,
    blockedByCount: r.blockedByCount ?? 0,
    blockingCount: r.blockingCount ?? 0,
    sourceMessageRef: r.sourceMessageRef
      ? { scopeType: r.sourceMessageRef.scopeType, scopeId: r.sourceMessageRef.scopeId, messageId: r.sourceMessageRef.messageId, workspaceId: r.sourceMessageRef.workspaceId ?? null }
      : null,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const LIVE = { deletedAt: null } as const;
const ORDER = [{ position: "asc" }, { id: "asc" }] as const;

/**
 * Bộ lọc danh sách (`overdue` = quá hạn và chưa ở cột DONE).
 * ⚠️ Prisma+Mongo: (1) `lt/lte` trên trường nullable KHỚP CẢ giá trị null ⇒ luôn kèm `not: null`. Trường VẮNG hẳn (thẻ seed cũ) thì
 * KHÔNG khớp: Prisma 5.22 tự kèm `$ne: [field, "$$REMOVE"]` vào mọi điều kiện `$expr` ⇒ không cần `isSet` (khoá bằng test
 * "thẻ THIẾU hẳn trường dueDate" ở tasks-labels.routes.test.ts — nâng Prisma mà đỏ thì mới thêm `isSet: true`);
 * (2) `contains` KHÔNG escape regex ⇒ chuỗi người dùng phải qua `escapeRegex` (chống ReDoS, chỉ khớp literal).
 */
function filterWhere(f: TaskListFilter, now: Date): Prisma.TaskWhereInput {
  return {
    ...(f.assigneeId && { assigneeIds: { has: f.assigneeId } }),
    ...(f.labelId && { labelIds: { has: f.labelId } }),
    ...(f.q && { normalizedTitle: { contains: escapeRegex(f.q) } }),
    ...(f.overdue && { dueDate: { lt: now, not: null }, columnKind: { not: "DONE" as const } }),
    ...(f.dueBefore && !f.overdue && { dueDate: { lte: f.dueBefore, not: null } }),
  };
}

export class PrismaTaskRepository implements ITaskRepository {
  async findById(id: string, tx?: TxContext): Promise<Task | null> {
    const r = await db(tx).task.findUnique({ where: { id } });
    return r ? mapTask(r) : null;
  }

  async findLiveByIds(ids: string[], tx?: TxContext): Promise<Task[]> {
    if (ids.length === 0) return [];
    const rows = await db(tx).task.findMany({ where: { id: { in: ids }, ...LIVE } });
    return rows.map(mapTask);
  }

  async create(input: TaskCreateInput, tx?: TxContext): Promise<Task> {
    const r = await db(tx).task.create({
      data: {
        boardId: input.boardId,
        workspaceId: input.workspaceId,
        columnId: input.columnId,
        columnKind: input.columnKind,
        position: input.position,
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        assigneeIds: input.assigneeIds,
        labelIds: input.labelIds,
        dueDate: input.dueDate,
        dueVersion: input.dueVersion,
        completedAt: input.completedAt,
        completionCount: input.completionCount,
        createdBy: input.createdBy,
        clientTaskId: input.clientTaskId,
        // Quy ước Mongo: mọi trường optional sau này lọc bằng `{field: null}` phải ghi null TƯỜNG MINH.
        description: input.description ?? null,
        startDate: input.startDate ?? null,
        storyPoints: input.storyPoints ?? null,
        ...(input.checklist && input.checklist.length > 0 && {
          checklist: input.checklist.map((i) => ({ id: i.id, text: i.text, done: i.done, doneBy: i.doneBy, doneAt: i.doneAt, order: i.order })),
          checklistTotal: input.checklist.length,
        }),
        // p7-04 — chỉ ghi khi thẻ tạo từ tin nhắn (thẻ tạo tay không có trường, đọc ra `null`).
        ...(input.sourceMessageRef && {
          sourceMessageRef: {
            scopeType: input.sourceMessageRef.scopeType,
            scopeId: input.sourceMessageRef.scopeId,
            messageId: input.sourceMessageRef.messageId,
            workspaceId: input.sourceMessageRef.workspaceId,
          },
        }),
        deletedFromColumnId: null,
        deletedAt: null,
        deletedBy: null,
      },
    });
    return mapTask(r);
  }

  async findByClientTaskId(boardId: string, createdBy: string, clientTaskId: string, tx?: TxContext): Promise<Task | null> {
    const r = await db(tx).task.findFirst({ where: { boardId, createdBy, clientTaskId, ...LIVE } });
    return r ? mapTask(r) : null;
  }

  countLive(boardId: string, tx?: TxContext): Promise<number> {
    return db(tx).task.count({ where: { boardId, ...LIVE } });
  }

  countInColumn(boardId: string, columnId: string, tx?: TxContext): Promise<number> {
    return db(tx).task.count({ where: { boardId, columnId, ...LIVE } });
  }

  async lastPosition(boardId: string, columnId: string, excludeId?: string, tx?: TxContext): Promise<string | null> {
    const r = await db(tx).task.findFirst({
      where: { boardId, columnId, ...LIVE, ...(excludeId && { id: { not: excludeId } }) },
      orderBy: [{ position: "desc" }, { id: "desc" }],
      select: { position: true },
    });
    return r?.position ?? null;
  }

  async adjacent(
    boardId: string,
    columnId: string,
    position: string,
    direction: AdjacentDirection,
    excludeId?: string,
    tx?: TxContext
  ): Promise<Task | null> {
    const after = direction === "after";
    const r = await db(tx).task.findFirst({
      where: {
        boardId,
        columnId,
        ...LIVE,
        ...(excludeId && { id: { not: excludeId } }),
        position: after ? { gt: position } : { lt: position },
      },
      orderBy: after ? [{ position: "asc" }, { id: "asc" }] : [{ position: "desc" }, { id: "desc" }],
    });
    return r ? mapTask(r) : null;
  }

  async moveCas(id: string, expectedVersion: number, set: TaskMoveSet, tx?: TxContext): Promise<Task | null> {
    const client = db(tx);
    const res = await client.task.updateMany({
      where: { id, version: expectedVersion, ...LIVE },
      data: {
        columnId: set.columnId,
        columnKind: set.columnKind,
        position: set.position,
        completedAt: set.completedAt,
        completionCount: set.completionCount,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async patchCas(id: string, expectedVersion: number, set: TaskPatchSet, tx?: TxContext): Promise<Task | null> {
    const res = await db(tx).task.updateMany({
      where: { id, version: expectedVersion, ...LIVE },
      data: {
        ...(set.title !== undefined && { title: set.title }),
        ...(set.normalizedTitle !== undefined && { normalizedTitle: set.normalizedTitle }),
        ...(set.description !== undefined && { description: set.description }),
        ...(set.assigneeIds !== undefined && { assigneeIds: { set: set.assigneeIds } }),
        ...(set.labelIds !== undefined && { labelIds: { set: set.labelIds } }),
        ...(set.startDate !== undefined && { startDate: set.startDate }),
        ...(set.dueDate !== undefined && { dueDate: set.dueDate }),
        ...(set.dueVersion !== undefined && { dueVersion: set.dueVersion }),
        ...(set.storyPoints !== undefined && { storyPoints: set.storyPoints }),
        version: { increment: 1 },
      },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async applyReschedule(id: string, expectedVersion: number, set: TaskRescheduleSet, tx: TxContext): Promise<boolean> {
    const res = await db(tx).task.updateMany({
      where: { id, version: expectedVersion, ...LIVE, columnKind: { not: "DONE" } },
      data: {
        startDate: set.startDate,
        dueDate: set.dueDate,
        ...(set.bumpDueVersion && { dueVersion: { increment: 1 } }),
        version: { increment: 1 },
      },
    });
    return res.count > 0;
  }

  async softDeleteCas(
    id: string,
    expectedVersion: number,
    set: { deletedAt: Date; deletedBy: string; deletedFromColumnId: string },
    tx: TxContext
  ): Promise<Task | null> {
    const res = await db(tx).task.updateMany({
      where: { id, version: expectedVersion, ...LIVE },
      data: { ...set, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async restoreCas(id: string, expectedVersion: number, set: TaskRestoreSet, tx: TxContext): Promise<Task | null> {
    const res = await db(tx).task.updateMany({
      // `not: null` = ĐANG bị xoá mềm (có mốc thời gian) — khôi phục thẻ đang sống là no-op.
      where: { id, version: expectedVersion, deletedAt: { not: null } },
      data: { ...set, deletedAt: null, deletedBy: null, deletedFromColumnId: null, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async bumpAttachmentCount(id: string, delta: 1 | -1, max: number, tx: TxContext): Promise<Task | null> {
    const res = await db(tx).task.updateMany({
      where: { id, ...LIVE, attachmentCount: delta === 1 ? { lt: max } : { gt: 0 } },
      data: { attachmentCount: { increment: delta }, version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async bumpCommentCount(id: string, delta: 1 | -1, tx: TxContext): Promise<Task | null> {
    const res = await db(tx).task.updateMany({
      where: { id, ...LIVE, ...(delta === -1 && { commentCount: { gt: 0 } }) },
      data: { commentCount: { increment: delta } },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async listColumn(boardId: string, columnId: string, filter: TaskListFilter, limit: number, now: Date): Promise<Task[]> {
    const rows = await db().task.findMany({
      where: { boardId, columnId, ...LIVE, ...filterWhere(filter, now) },
      orderBy: [...ORDER],
      take: limit,
    });
    return rows.map(mapTask);
  }

  async listColumnAll(boardId: string, columnId: string, tx?: TxContext): Promise<Task[]> {
    const rows = await db(tx).task.findMany({ where: { boardId, columnId, ...LIVE }, orderBy: [...ORDER] });
    return rows.map(mapTask);
  }

  async updatePositions(items: { id: string; position: string }[], tx: TxContext): Promise<number> {
    const client = db(tx);
    let changed = 0;
    for (const item of items) {
      const res = await client.task.updateMany({ where: { id: item.id }, data: { position: item.position } });
      changed += res.count;
    }
    return changed;
  }

  async setColumnKind(boardId: string, columnId: string, kind: TaskMoveSet["columnKind"], tx: TxContext): Promise<number> {
    const res = await db(tx).task.updateMany({ where: { boardId, columnId }, data: { columnKind: kind } });
    return res.count;
  }

  async countsByBoard(boardIds: string[]): Promise<Map<string, BoardTaskCounts>> {
    const result = new Map<string, BoardTaskCounts>();
    for (const id of boardIds) result.set(id, { byColumn: new Map(), total: 0 });
    if (boardIds.length === 0) return result;
    const groups = await db().task.groupBy({
      by: ["boardId", "columnId"],
      where: { boardId: { in: boardIds }, ...LIVE },
      _count: { _all: true },
    });
    for (const g of groups) {
      const entry = result.get(g.boardId);
      if (!entry) continue;
      entry.byColumn.set(g.columnId, g._count._all);
      entry.total += g._count._all;
    }
    return result;
  }

  async pullLabel(boardId: string, labelId: string): Promise<string[]> {
    const client = db();
    const affected = await client.task.findMany({
      where: { boardId, labelIds: { has: labelId } },
      select: { id: true, deletedAt: true, labelIds: true },
    });
    // Prisma (Mongo) không có `pull` cho scalar list → ghi lại danh sách đã lọc, theo lô nhỏ để không chặn.
    for (let i = 0; i < affected.length; i += 25) {
      await Promise.all(
        affected.slice(i, i + 25).map((t) =>
          client.task.update({ where: { id: t.id }, data: { labelIds: { set: t.labelIds.filter((l) => l !== labelId) } } })
        )
      );
    }
    return affected.filter((t) => t.deletedAt === null).map((t) => t.id);
  }

  countWithLabel(boardId: string, labelId: string): Promise<number> {
    return db().task.count({ where: { boardId, labelIds: { has: labelId }, ...LIVE } });
  }

  async setReviewState(id: string, state: ReviewStateValue, tx?: TxContext): Promise<boolean> {
    const res = await db(tx).task.updateMany({ where: { id }, data: { reviewState: state } });
    return res.count > 0;
  }

  async listLiveByKind(boardId: string, kind: ColumnKindValue, afterId: string | null, limit: number, tx?: TxContext): Promise<Task[]> {
    const rows = await db(tx).task.findMany({
      where: { boardId, columnKind: kind, ...LIVE, ...(afterId && { id: { gt: afterId } }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(mapTask);
  }
}
