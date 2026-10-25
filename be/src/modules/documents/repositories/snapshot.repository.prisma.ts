import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { SnapshotKindValue, SnapshotMeta, SnapshotWithState } from "../entities/document.interface";
import type { ISnapshotRepository, NewSnapshot, SnapshotListParams } from "./snapshot.repository.interface";
import type { TxHandle } from "./tx";

/** Metadata bản lưu — KHÔNG chọn `yjsState` (nặng). */
const META_SELECT = { id: true, documentId: true, kind: true, label: true, yjsVersion: true, sizeBytes: true, createdBy: true, at: true } satisfies Prisma.DocumentSnapshotSelect;

export class PrismaSnapshotRepository implements ISnapshotRepository {
  async create(data: NewSnapshot, tx?: TxHandle): Promise<SnapshotMeta> {
    const client = tx ?? prisma;
    return client.documentSnapshot.create({
      data: {
        documentId: data.documentId,
        kind: data.kind,
        label: data.label,
        yjsState: Buffer.from(data.yjsState),
        yjsVersion: data.yjsVersion,
        sizeBytes: data.yjsState.byteLength,
        createdBy: data.createdBy,
      },
      select: META_SELECT,
    });
  }

  list(p: SnapshotListParams): Promise<SnapshotMeta[]> {
    return prisma.documentSnapshot.findMany({
      where: {
        documentId: p.documentId,
        ...(p.kind ? { kind: p.kind } : {}),
        ...(p.cursor ? { OR: [{ at: { lt: p.cursor.at } }, { at: p.cursor.at, id: { lt: p.cursor.id } }] } : {}),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: META_SELECT,
    });
  }

  async findWithState(documentId: string, snapshotId: string): Promise<SnapshotWithState | null> {
    const row = await prisma.documentSnapshot.findFirst({ where: { id: snapshotId, documentId }, select: { ...META_SELECT, yjsState: true } });
    return row;
  }

  countByKind(documentId: string, kind: SnapshotKindValue): Promise<number> {
    return prisma.documentSnapshot.count({ where: { documentId, kind } });
  }

  latestOfKind(documentId: string, kind: SnapshotKindValue): Promise<SnapshotMeta | null> {
    return prisma.documentSnapshot.findFirst({ where: { documentId, kind }, orderBy: [{ at: "desc" }, { id: "desc" }], select: META_SELECT });
  }

  async pruneKeepNewest(documentId: string, kind: SnapshotKindValue, keep: number, tx?: TxHandle): Promise<number> {
    const client = tx ?? prisma;
    const stale = await client.documentSnapshot.findMany({
      where: { documentId, kind },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: Math.max(0, keep),
      select: { id: true },
    });
    if (stale.length === 0) return 0;
    const res = await client.documentSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    return res.count;
  }

  async countByDocuments(documentIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (documentIds.length === 0) return out;
    const groups = await prisma.documentSnapshot.groupBy({ by: ["documentId"], where: { documentId: { in: documentIds } }, _count: { _all: true } });
    for (const g of groups) out.set(g.documentId, g._count._all);
    return out;
  }
}
