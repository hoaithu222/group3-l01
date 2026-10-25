import { Prisma } from "@prisma/client";
import type { Label, LabelCreateInput, LabelPatch } from "../entities/label.interface";
import type { ILabelRepository } from "./label.repository.interface";
import { db } from "./prisma-tx";
import type { TxContext } from "./unit-of-work";

type LabelRecord = Prisma.LabelGetPayload<Record<string, never>>;

const mapLabel = (r: LabelRecord): Label => ({
  id: r.id,
  boardId: r.boardId,
  workspaceId: r.workspaceId,
  name: r.name,
  normalizedName: r.normalizedName,
  color: r.color,
  createdAt: r.createdAt,
});

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const isNotFound = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";

export class PrismaLabelRepository implements ILabelRepository {
  async findById(id: string): Promise<Label | null> {
    const r = await db().label.findUnique({ where: { id } });
    return r ? mapLabel(r) : null;
  }

  async listByBoard(boardId: string): Promise<Label[]> {
    const rows = await db().label.findMany({ where: { boardId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(mapLabel);
  }

  async findByBoardAndIds(boardId: string, ids: string[], tx?: TxContext): Promise<Label[]> {
    if (ids.length === 0) return [];
    const rows = await db(tx).label.findMany({ where: { boardId, id: { in: ids } } });
    return rows.map(mapLabel);
  }

  countByBoard(boardId: string): Promise<number> {
    return db().label.count({ where: { boardId } });
  }

  async findByName(boardId: string, normalizedName: string): Promise<Label | null> {
    const r = await db().label.findUnique({ where: { boardId_normalizedName: { boardId, normalizedName } } });
    return r ? mapLabel(r) : null;
  }

  async create(input: LabelCreateInput): Promise<Label | null> {
    try {
      return mapLabel(await db().label.create({ data: input }));
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async update(id: string, patch: LabelPatch): Promise<Label | null> {
    try {
      const r = await db().label.update({
        where: { id },
        data: {
          ...(patch.name !== undefined && { name: patch.name, normalizedName: patch.normalizedName }),
          ...(patch.color !== undefined && { color: patch.color }),
        },
      });
      return mapLabel(r);
    } catch (err) {
      if (isNotFound(err) || isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const res = await db().label.deleteMany({ where: { id } });
    return res.count > 0;
  }
}
