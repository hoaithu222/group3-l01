import type { Settlement as PrismaSettlement } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { Settlement, SettlementAllocationRow, SettlementStatusValue } from "../entities/wallet.interface";
import type { Tx } from "./wallet.repository.interface";
import type {
  ISettlementRepository,
  NewSettlement,
  SettlementListFilter,
  SettlementTransition,
} from "./settlement.repository.interface";

function toSettlement(row: PrismaSettlement): Settlement {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    code: row.code,
    fromId: row.fromId,
    toId: row.toId,
    amount: row.amount,
    method: row.method,
    proofAssetId: row.proofAssetId,
    note: row.note,
    status: row.status,
    allocations: row.allocations.map((a) => ({ shareId: a.shareId, amount: a.amount })),
    createdBy: row.createdBy,
    confirmedAt: row.confirmedAt,
    rejectedAt: row.rejectedAt,
    rejectReason: row.rejectReason,
    cancelledAt: row.cancelledAt,
    staleNotifiedAt: row.staleNotifiedAt,
    version: row.version,
    createdAt: row.createdAt,
  };
}

function transitionData(change: SettlementTransition) {
  if (change.to === "CONFIRMED") return { status: "CONFIRMED" as const, confirmedAt: change.at };
  if (change.to === "REJECTED") return { status: "REJECTED" as const, rejectedAt: change.at, rejectReason: change.reason };
  return { status: "CANCELLED" as const, cancelledAt: change.at };
}

export class PrismaSettlementRepository implements ISettlementRepository {
  async create(data: NewSettlement, tx: Tx): Promise<Settlement> {
    const row = await tx.settlement.create({
      data: {
        ...data,
        allocations: [],
        // Explicit null: job `wallet.settlement-stale` lọc `staleNotifiedAt: null` (Prisma+Mongo không khớp field absent).
        confirmedAt: null,
        rejectedAt: null,
        rejectReason: null,
        cancelledAt: null,
        staleNotifiedAt: null,
      },
    });
    return toSettlement(row);
  }

  async findById(id: string, tx?: Tx): Promise<Settlement | null> {
    const row = await (tx ?? prisma).settlement.findUnique({ where: { id } });
    return row ? toSettlement(row) : null;
  }

  async findByCode(code: string): Promise<Settlement | null> {
    const row = await prisma.settlement.findUnique({ where: { code } });
    return row ? toSettlement(row) : null;
  }

  async list(workspaceId: string, f: SettlementListFilter): Promise<Settlement[]> {
    const rows = await prisma.settlement.findMany({
      where: {
        workspaceId,
        ...(f.status ? { status: f.status } : {}),
        ...(f.involving ? { OR: [{ fromId: f.involving }, { toId: f.involving }] } : {}),
        ...(f.cursor
          ? { AND: [{ OR: [{ createdAt: { lt: f.cursor.at } }, { createdAt: f.cursor.at, id: { lt: f.cursor.id } }] }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: f.limit + 1,
    });
    return rows.map(toSettlement);
  }

  async transitionFromPending(id: string, change: SettlementTransition, tx: Tx): Promise<number> {
    const result = await tx.settlement.updateMany({
      where: { id, status: "PENDING" },
      data: { ...transitionData(change), version: { increment: 1 } },
    });
    return result.count;
  }

  async setAllocations(id: string, allocations: SettlementAllocationRow[], tx: Tx): Promise<void> {
    await tx.settlement.update({ where: { id }, data: { allocations: { set: allocations } } });
  }

  async listStalePending(before: Date, limit: number): Promise<Settlement[]> {
    const rows = await prisma.settlement.findMany({
      where: { status: "PENDING", staleNotifiedAt: null, createdAt: { lt: before } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toSettlement);
  }

  async markStaleNotified(id: string, at: Date): Promise<boolean> {
    const result = await prisma.settlement.updateMany({
      where: { id, staleNotifiedAt: null },
      data: { staleNotifiedAt: at },
    });
    return result.count > 0;
  }

  async listConfirmed(workspaceId: string): Promise<Settlement[]> {
    const rows = await prisma.settlement.findMany({ where: { workspaceId, status: "CONFIRMED" } });
    return rows.map(toSettlement);
  }

  async countSince(workspaceId: string, status: SettlementStatusValue, since: Date): Promise<number> {
    const at = status === "CONFIRMED" ? { confirmedAt: { gte: since } } : { createdAt: { gte: since } };
    return prisma.settlement.count({ where: { workspaceId, status, ...at } });
  }

  async countStalePending(workspaceId: string, before: Date): Promise<number> {
    return prisma.settlement.count({ where: { workspaceId, status: "PENDING", createdAt: { lt: before } } });
  }
}
