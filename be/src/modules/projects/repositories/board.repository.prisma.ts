import { Prisma } from "@prisma/client";
import type { Board, BoardColumn, BoardCreateInput, BoardPatch } from "../entities/board.interface";
import type { BoardReviewConfig } from "../entities/task-review.interface";
import type { IBoardRepository } from "./board.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type BoardRecord = Prisma.BoardGetPayload<Record<string, never>>;

const toColumn = (c: BoardRecord["columns"][number]): BoardColumn => ({
  id: c.id,
  title: c.title,
  kind: c.kind,
  order: c.order,
  wipLimit: c.wipLimit ?? null,
});

function mapBoard(r: BoardRecord): Board {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    normalizedName: r.normalizedName,
    description: r.description ?? null,
    columns: [...r.columns].map(toColumn).sort((a, b) => a.order - b.order),
    review: r.review ?? null,
    createdBy: r.createdBy,
    archivedAt: r.archivedAt ?? null,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const columnsData = (cols: BoardColumn[]) => cols.map((c) => ({ ...c, wipLimit: c.wipLimit ?? null }));

export class PrismaBoardRepository implements IBoardRepository {
  async findById(id: string, tx?: TxContext): Promise<Board | null> {
    const r = await db(tx).board.findUnique({ where: { id } });
    return r ? mapBoard(r) : null;
  }

  async listByWorkspace(workspaceId: string, archived: boolean): Promise<Board[]> {
    const rows = await db().board.findMany({
      where: { workspaceId, archivedAt: archived ? { not: null } : null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapBoard);
  }

  async listIdsByWorkspace(workspaceId: string): Promise<string[]> {
    const rows = await db().board.findMany({ where: { workspaceId }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  countActive(workspaceId: string, tx?: TxContext): Promise<number> {
    return db(tx).board.count({ where: { workspaceId, archivedAt: null } });
  }

  async create(input: BoardCreateInput, tx?: TxContext): Promise<Board> {
    const r = await db(tx).board.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        normalizedName: input.normalizedName,
        description: input.description,
        columns: columnsData(input.columns),
        // JSON: không ghi `null` tường minh (Prisma đòi `Prisma.JsonNull`) — vắng ≡ tắt chấm chéo (`parseBoardReview`), không lọc theo `review: null`.
        ...(input.review && { review: input.review as unknown as Prisma.InputJsonValue }),
        createdBy: input.createdBy,
        archivedAt: null,
      },
    });
    return mapBoard(r);
  }

  async updateCas(id: string, expectedVersion: number, patch: BoardPatch, tx?: TxContext): Promise<Board | null> {
    const client = db(tx);
    const res = await client.board.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.name !== undefined && { name: patch.name, normalizedName: patch.normalizedName }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.columns !== undefined && { columns: { set: columnsData(patch.columns) } }),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async setArchived(id: string, archivedAt: Date | null, tx?: TxContext): Promise<Board | null> {
    const client = db(tx);
    const res = await client.board.updateMany({ where: { id }, data: { archivedAt, version: { increment: 1 } } });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async updateReviewCas(id: string, expectedVersion: number, review: BoardReviewConfig, tx?: TxContext): Promise<Board | null> {
    const res = await db(tx).board.updateMany({
      where: { id, version: expectedVersion },
      data: { review: review as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    return this.findById(id, tx);
  }

  async touch(id: string, tx: TxContext): Promise<boolean> {
    const res = await db(tx).board.updateMany({ where: { id }, data: { updatedAt: new Date() } });
    return res.count > 0;
  }
}
