import { normalizeSearch } from "../../../src/core/utils/normalize";
import { nanoid } from "../../../src/core/utils/nanoid";
import { between, evenKeys } from "../../../src/modules/projects/services/task-position";
import type { BoardSpec, PersonKey, TaskSpec } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";
import type { WorkspaceCtx } from "./workspace";

export interface SeededTask {
  id: string;
  boardId: string;
  title: string;
  createdBy: PersonKey;
  assignees: PersonKey[];
  createdAt: Date;
  comments: Array<{ id: string; by: PersonKey; createdAt: Date }>;
  /** Có giá trị khi thẻ nằm ở cột DONE. */
  completedAt: Date | null;
  dueDate: Date | null;
}

interface BoardColumn {
  id: string;
  title: string;
  kind: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  order: number;
  wipLimit?: number | null;
}

/** Hạn chót lúc 23:59 giờ Việt Nam của ngày (hôm nay + `days`). */
function dueAt(now: Date, days: number): Date {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const endOfDayUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), 23, 59, 0) - 7 * 3_600_000;
  return new Date(endOfDayUtc + days * DAY_MS);
}

/** Tạo bảng + nhãn + thẻ (kèm checklist, bình luận, nhật ký hoạt động). Idempotent theo `clientTaskId`. */
export async function seedBoards(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<SeededTask[]> {
  const seeded: SeededTask[] = [];
  for (const spec of ctx.spec.boards) seeded.push(...(await seedBoard(dir, ctx, spec, now)));
  return seeded;
}

async function seedBoard(dir: Directory, ctx: WorkspaceCtx, spec: BoardSpec, now: Date): Promise<SeededTask[]> {
  const normalizedName = normalizeSearch(spec.name);
  const rng = rngFrom(`board:${ctx.spec.key}:${normalizedName}`);
  const life = Math.max(now.getTime() - ctx.createdAt.getTime(), DAY_MS);

  let board = await prisma.board.findFirst({ where: { workspaceId: ctx.id, normalizedName, archivedAt: null } });
  if (!board) {
    const columns: BoardColumn[] = spec.columns.map((c, i) => ({
      id: `c_${nanoid(8)}`,
      title: c.title,
      kind: c.kind,
      order: i,
      ...(c.wipLimit !== undefined ? { wipLimit: c.wipLimit } : {}),
    }));
    board = await prisma.board.create({
      data: {
        workspaceId: ctx.id,
        name: spec.name,
        normalizedName,
        description: spec.description ?? null,
        columns,
        createdBy: ctx.ownerId,
        // Quy ước Mongo null-vs-absent (board.repository.prisma.ts#create): danh sách bảng lọc `archivedAt: null`.
        archivedAt: null,
        createdAt: new Date(ctx.createdAt.getTime() + Math.floor(life * (0.05 + rng() * 0.2))),
      },
    });
  }
  const columns = board.columns as unknown as BoardColumn[];
  const columnOf = (task: TaskSpec): BoardColumn => {
    const byIndex = columns[task.col];
    const specCol = spec.columns[task.col];
    if (!specCol) throw new Error(`[${ctx.spec.key}] bảng "${spec.name}": thẻ "${task.title}" trỏ cột ${task.col} không tồn tại`);
    const byTitle = columns.find((c) => normalizeSearch(c.title) === normalizeSearch(specCol.title));
    const found = byTitle ?? byIndex;
    if (!found) throw new Error(`[${ctx.spec.key}] bảng "${spec.name}": không có cột cho thẻ "${task.title}"`);
    return found;
  };

  const labelIds = new Map<string, string>();
  for (const [name, color] of spec.labels) {
    const key = normalizeSearch(name);
    const existing = await prisma.label.findUnique({ where: { boardId_normalizedName: { boardId: board.id, normalizedName: key } } });
    const label = existing ?? (await prisma.label.create({ data: { boardId: board.id, workspaceId: ctx.id, name, normalizedName: key, color } }));
    labelIds.set(name, label.id);
  }

  // Vị trí: cột còn trống thì rải đều, cột đã có thẻ thì nối vào cuối.
  const lastPosByColumn = new Map<string, string | null>();
  for (const col of columns) {
    const last = await prisma.task.findFirst({ where: { boardId: board.id, columnId: col.id, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
    lastPosByColumn.set(col.id, last?.position ?? null);
  }
  const perColumnCount = new Map<string, number>();
  spec.tasks.forEach((t) => perColumnCount.set(columnOf(t).id, (perColumnCount.get(columnOf(t).id) ?? 0) + 1));
  const evenByColumn = new Map<string, string[]>();
  for (const [colId, n] of perColumnCount) if (lastPosByColumn.get(colId) === null) evenByColumn.set(colId, evenKeys(n));
  const usedInColumn = new Map<string, number>();

  const out: SeededTask[] = [];
  for (let i = 0; i < spec.tasks.length; i++) {
    const t = spec.tasks[i];
    const col = columnOf(t);
    const clientTaskId = `seed-rich:${ctx.spec.key}:${normalizedName}:${i}`;
    const used = usedInColumn.get(col.id) ?? 0;
    usedInColumn.set(col.id, used + 1);
    const already = await prisma.task.findFirst({ where: { boardId: board.id, clientTaskId }, select: { id: true } });
    if (already) continue;

    let position: string;
    const even = evenByColumn.get(col.id);
    if (even) position = even[used];
    else {
      position = between(lastPosByColumn.get(col.id) ?? null, null);
      lastPosByColumn.set(col.id, position);
    }

    const trng = rngFrom(`task:${clientTaskId}`);
    const creatorKey = t.by ?? ctx.spec.owner;
    const createdAt = new Date(Math.max(board.createdAt.getTime(), now.getTime() - Math.floor((1 + trng() * 14) * DAY_MS)));
    const assignees = t.assignees ?? [];
    const done = col.kind === "DONE";
    const checklist = (t.checklist ?? []).map(([text, isDone], j) => ({
      id: nanoid(24),
      text,
      done: isDone,
      doneBy: isDone ? dir.id(assignees[0] ?? creatorKey) : null,
      doneAt: isDone ? new Date(createdAt.getTime() + Math.floor((0.5 + trng() * 3) * DAY_MS)) : null,
      order: (j + 1) * 1024,
    }));
    const completedAt = done ? new Date(Math.max(createdAt.getTime() + 3_600_000, now.getTime() - Math.floor((0.2 + trng() * 6) * DAY_MS))) : null;

    const task = await prisma.task.create({
      data: {
        boardId: board.id,
        workspaceId: ctx.id,
        columnId: col.id,
        columnKind: col.kind,
        position,
        title: t.title,
        normalizedTitle: normalizeSearch(t.title),
        description: t.desc ?? null,
        assigneeIds: assignees.map((k) => dir.id(k)),
        labelIds: (t.labels ?? []).map((n) => {
          const id = labelIds.get(n);
          if (!id) throw new Error(`[${ctx.spec.key}] bảng "${spec.name}": nhãn "${n}" của thẻ "${t.title}" không có trong labels`);
          return id;
        }),
        startDate: t.startInDays !== undefined ? dueAt(now, t.startInDays) : null,
        dueDate: t.dueInDays !== undefined ? dueAt(now, t.dueInDays) : null,
        dueVersion: t.dueInDays !== undefined ? 1 : 0,
        storyPoints: t.points ?? null,
        checklist,
        checklistDone: checklist.filter((c) => c.done).length,
        checklistTotal: checklist.length,
        commentCount: t.comments?.length ?? 0,
        completedAt,
        completionCount: done ? 1 : 0,
        createdBy: dir.id(creatorKey),
        clientTaskId,
        // Quy ước Mongo null-vs-absent (task.repository.prisma.ts#create): ba field này phải ghi null tường minh.
        deletedFromColumnId: null,
        deletedAt: null,
        deletedBy: null,
        createdAt,
      },
    });

    const firstColumn = columns[0];
    await prisma.taskActivity.create({
      data: { taskId: task.id, boardId: board.id, workspaceId: ctx.id, actorId: dir.id(creatorKey), type: "CREATED", before: undefined, after: { columnId: firstColumn.id, columnKind: firstColumn.kind }, at: createdAt },
    });
    if (col.id !== firstColumn.id) {
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          boardId: board.id,
          workspaceId: ctx.id,
          actorId: dir.id(assignees[0] ?? creatorKey),
          type: "MOVED",
          before: { columnId: firstColumn.id, columnKind: firstColumn.kind },
          after: { columnId: col.id, columnKind: col.kind },
          at: completedAt ?? new Date(createdAt.getTime() + Math.floor((0.3 + trng() * 2) * DAY_MS)),
        },
      });
    }

    const comments: SeededTask["comments"] = [];
    let ct = createdAt.getTime();
    for (let k = 0; k < (t.comments ?? []).length; k++) {
      const [by, text] = (t.comments as Array<[PersonKey, string]>)[k];
      ct = Math.min(ct + Math.floor((2 + trng() * 30) * 3_600_000), now.getTime() - 60_000);
      const row = await prisma.taskComment.create({
        data: {
          taskId: task.id,
          boardId: board.id,
          workspaceId: ctx.id,
          authorId: dir.id(by),
          clientCommentId: `seed-rich:c:${clientTaskId}:${k}`,
          content: text,
          mentions: [],
          attachmentCount: 0,
          editedAt: null,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          createdAt: new Date(ct),
        },
      });
      comments.push({ id: row.id, by, createdAt: row.createdAt });
    }
    out.push({ id: task.id, boardId: board.id, title: t.title, createdBy: creatorKey, assignees, createdAt, comments, completedAt, dueDate: task.dueDate });
  }
  return out;
}
