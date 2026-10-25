import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { WhiteboardEntity, WhiteboardWithState } from "../entities/whiteboard.interface";
import type { IWhiteboardRepository, MetaPatch, NewWhiteboard, StateWrite, WhiteboardListParams } from "./whiteboard.repository.interface";
import type { TxHandle } from "./tx";

/** KHÔNG chọn `yjsState` (nặng) — metadata luôn nhẹ; state chỉ tải qua `findWithState`. */
const META_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  normalizedName: true,
  visibility: true,
  status: true,
  yjsVersion: true,
  elementCount: true,
  thumbnailAssetId: true,
  lastEditedBy: true,
  lastEditedAt: true,
  createdBy: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WhiteboardSelect;

type MetaRow = Prisma.WhiteboardGetPayload<{ select: typeof META_SELECT }>;

const toEntity = (row: MetaRow): WhiteboardEntity => ({ ...row });

export class PrismaWhiteboardRepository implements IWhiteboardRepository {
  async create(data: NewWhiteboard, tx: TxHandle): Promise<WhiteboardEntity> {
    // Ghi `null` TƯỜNG MINH cho trường optional (Prisma-Mongo không khớp `{field: null}` với trường vắng — xem be_prisma_mongo_null_vs_absent).
    const row = await tx.whiteboard.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        normalizedName: data.normalizedName,
        visibility: data.visibility,
        status: "ACTIVE",
        yjsState: null,
        thumbnailAssetId: null,
        lastEditedBy: null,
        lastEditedAt: null,
        archivedAt: null,
        createdBy: data.createdBy,
      },
      select: META_SELECT,
    });
    return toEntity(row);
  }

  async findById(id: string): Promise<WhiteboardEntity | null> {
    const row = await prisma.whiteboard.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async findWithState(id: string, tx?: TxHandle): Promise<WhiteboardWithState | null> {
    const client = tx ?? prisma;
    const row = await client.whiteboard.findUnique({ where: { id }, select: { ...META_SELECT, yjsState: true } });
    if (!row) return null;
    const { yjsState, ...meta } = row;
    return { ...toEntity(meta), yjsState };
  }

  countActive(workspaceId: string): Promise<number> {
    return prisma.whiteboard.count({ where: { workspaceId, status: "ACTIVE" } });
  }

  async list(p: WhiteboardListParams): Promise<WhiteboardEntity[]> {
    // Bảng người này ĐƯỢC MỜI (mọi workspace; lọc theo workspace ở điều kiện chính) — bị chặn bởi số lời mời của một người.
    const invited = (await prisma.whiteboardCollaborator.findMany({ where: { userId: p.userId }, select: { whiteboardId: true } })).map((c) => c.whiteboardId);
    const visible: Prisma.WhiteboardWhereInput[] = [{ createdBy: p.userId }];
    if (p.seesWorkspaceBoards) visible.push({ visibility: "WORKSPACE" });
    if (invited.length > 0) visible.push({ id: { in: invited } });

    const and: Prisma.WhiteboardWhereInput[] = [{ OR: visible }];
    if (p.cursor) and.push({ OR: [{ updatedAt: { lt: p.cursor.at } }, { updatedAt: p.cursor.at, id: { lt: p.cursor.id } }] });
    const rows = await prisma.whiteboard.findMany({
      where: { workspaceId: p.workspaceId, status: p.status, ...(p.q ? { normalizedName: { contains: p.q } } : {}), AND: and },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: META_SELECT,
    });
    return rows.map(toEntity);
  }

  async updateMeta(id: string, expectedVersion: number, patch: MetaPatch, tx: TxHandle): Promise<WhiteboardEntity | null> {
    const res = await tx.whiteboard.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.normalizedName !== undefined ? { normalizedName: patch.normalizedName } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        ...(patch.thumbnailAssetId !== undefined ? { thumbnailAssetId: patch.thumbnailAssetId } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) return null;
    const row = await tx.whiteboard.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async writeState(id: string, expectedYjsVersion: number, w: StateWrite, tx: TxHandle): Promise<WhiteboardEntity | null> {
    const res = await tx.whiteboard.updateMany({
      where: { id, yjsVersion: expectedYjsVersion },
      data: {
        yjsState: Buffer.from(w.yjsState),
        yjsVersion: w.yjsVersion,
        elementCount: w.elementCount,
        lastEditedAt: w.lastEditedAt,
        ...(w.lastEditedBy ? { lastEditedBy: w.lastEditedBy } : {}),
        ...(w.bumpVersion ? { version: { increment: 1 } } : {}),
      },
    });
    if (res.count === 0) return null;
    const row = await tx.whiteboard.findUnique({ where: { id }, select: META_SELECT });
    return row ? toEntity(row) : null;
  }

  async findSnapshotCandidates(since: Date, afterId: string | null, limit: number): Promise<WhiteboardEntity[]> {
    const rows = await prisma.whiteboard.findMany({
      where: { status: "ACTIVE", yjsVersion: { gt: 0 }, lastEditedAt: { gte: since }, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" },
      take: limit,
      select: META_SELECT,
    });
    return rows.map(toEntity);
  }
}
