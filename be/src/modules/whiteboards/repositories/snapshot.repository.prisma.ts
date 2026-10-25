import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { SnapshotKindValue, SnapshotMeta, SnapshotWithState } from "../entities/whiteboard.interface";
import type { ISnapshotRepository, NewSnapshot, SnapshotListParams } from "./snapshot.repository.interface";
import type { TxHandle } from "./tx";

/** Metadata bản lưu — KHÔNG chọn `yjsState` (nặng). */
const META_SELECT = { id: true, whiteboardId: true, kind: true, label: true, elementCount: true, createdBy: true, at: true } satisfies Prisma.WhiteboardSnapshotSelect;

export class PrismaSnapshotRepository implements ISnapshotRepository {
  async create(data: NewSnapshot, tx?: TxHandle): Promise<SnapshotMeta> {
    const client = tx ?? prisma;
    return client.whiteboardSnapshot.create({
      data: {
        whiteboardId: data.whiteboardId,
        kind: data.kind,
        label: data.label,
        yjsState: Buffer.from(data.yjsState),
        elementCount: data.elementCount,
        createdBy: data.createdBy,
      },
      select: META_SELECT,
    });
  }

  list(p: SnapshotListParams): Promise<SnapshotMeta[]> {
    return prisma.whiteboardSnapshot.findMany({
      where: {
        whiteboardId: p.whiteboardId,
        ...(p.kind ? { kind: p.kind } : {}),
        ...(p.cursor ? { OR: [{ at: { lt: p.cursor.at } }, { at: p.cursor.at, id: { lt: p.cursor.id } }] } : {}),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: META_SELECT,
    });
  }

  async findWithState(whiteboardId: string, snapshotId: string): Promise<SnapshotWithState | null> {
    return prisma.whiteboardSnapshot.findFirst({ where: { id: snapshotId, whiteboardId }, select: { ...META_SELECT, yjsState: true } });
  }

  countByKind(whiteboardId: string, kind: SnapshotKindValue): Promise<number> {
    return prisma.whiteboardSnapshot.count({ where: { whiteboardId, kind } });
  }

  latestOfKind(whiteboardId: string, kind: SnapshotKindValue): Promise<SnapshotMeta | null> {
    return prisma.whiteboardSnapshot.findFirst({ where: { whiteboardId, kind }, orderBy: [{ at: "desc" }, { id: "desc" }], select: META_SELECT });
  }

  async pruneKeepNewest(whiteboardId: string, kind: SnapshotKindValue, keep: number, tx?: TxHandle): Promise<number> {
    const client = tx ?? prisma;
    const stale = await client.whiteboardSnapshot.findMany({
      where: { whiteboardId, kind },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: Math.max(0, keep),
      select: { id: true },
    });
    if (stale.length === 0) return 0;
    const res = await client.whiteboardSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    return res.count;
  }
}
