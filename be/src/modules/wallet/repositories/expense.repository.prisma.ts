import type { Prisma, WorkspaceExpense, ExpenseShare as PrismaShare } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { Expense, ExpenseShare } from "../entities/wallet.interface";
import type { Tx } from "./wallet.repository.interface";
import type {
  ExpenseListFilter,
  ExpensePatch,
  IExpenseRepository,
  NewExpense,
  NewShare,
} from "./expense.repository.interface";

function toExpense(row: WorkspaceExpense): Expense {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    adjustsExpenseId: row.adjustsExpenseId,
    amount: row.amount,
    description: row.description,
    category: row.category,
    paidBy: row.paidBy,
    splitType: row.splitType,
    participants: row.participants.map((p) => ({ userId: p.userId, amount: p.amount ?? null, bps: p.bps ?? null })),
    receiptAssetId: row.receiptAssetId,
    occurredAt: row.occurredAt,
    createdBy: row.createdBy,
    version: row.version,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
  };
}

function toShare(row: PrismaShare): ExpenseShare {
  return {
    id: row.id,
    expenseId: row.expenseId,
    workspaceId: row.workspaceId,
    debtorId: row.debtorId,
    creditorId: row.creditorId,
    amount: row.amount,
    paidAmount: row.paidAmount,
    status: row.status,
    occurredAt: row.occurredAt,
  };
}

const participantsData = (rows: NewExpense["participants"]) =>
  rows.map((p) => ({ userId: p.userId, amount: p.amount, bps: p.bps }));

export class PrismaExpenseRepository implements IExpenseRepository {
  async create(data: NewExpense, tx: Tx): Promise<Expense> {
    const row = await tx.workspaceExpense.create({
      data: {
        workspaceId: data.workspaceId,
        kind: data.kind,
        adjustsExpenseId: data.adjustsExpenseId,
        amount: data.amount,
        description: data.description,
        normalizedDescription: data.normalizedDescription,
        category: data.category,
        paidBy: data.paidBy,
        splitType: data.splitType,
        participants: participantsData(data.participants),
        receiptAssetId: data.receiptAssetId,
        occurredAt: data.occurredAt,
        createdBy: data.createdBy,
        // Explicit null: danh sách lọc `deletedAt: null` (Prisma+Mongo không khớp field absent).
        deletedAt: null,
        deletedBy: null,
      },
    });
    return toExpense(row);
  }

  async findById(id: string, tx?: Tx): Promise<Expense | null> {
    const row = await (tx ?? prisma).workspaceExpense.findUnique({ where: { id } });
    return row ? toExpense(row) : null;
  }

  async update(id: string, expectedVersion: number, patch: ExpensePatch, tx: Tx): Promise<Expense | null> {
    const result = await tx.workspaceExpense.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...patch, participants: { set: participantsData(patch.participants) }, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return toExpense(await tx.workspaceExpense.findUniqueOrThrow({ where: { id } }));
  }

  async softDelete(id: string, actorId: string, tx: Tx): Promise<boolean> {
    const result = await tx.workspaceExpense.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorId, version: { increment: 1 } },
    });
    return result.count > 0;
  }

  async listAdjustments(expenseId: string, tx?: Tx): Promise<Expense[]> {
    const rows = await (tx ?? prisma).workspaceExpense.findMany({
      where: { adjustsExpenseId: expenseId, deletedAt: null },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toExpense);
  }

  async list(workspaceId: string, f: ExpenseListFilter): Promise<Expense[]> {
    const and: Prisma.WorkspaceExpenseWhereInput[] = [];
    if (f.userId) and.push({ OR: [{ paidBy: f.userId }, { participants: { some: { userId: f.userId } } }] });
    if (f.cursor) {
      and.push({ OR: [{ occurredAt: { lt: f.cursor.at } }, { occurredAt: f.cursor.at, id: { lt: f.cursor.id } }] });
    }
    const rows = await prisma.workspaceExpense.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(f.category ? { category: f.category } : {}),
        ...(f.from || f.to ? { occurredAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: f.limit + 1,
    });
    return rows.map(toExpense);
  }

  async createShares(rows: NewShare[], tx: Tx): Promise<void> {
    if (rows.length === 0) return;
    await tx.expenseShare.createMany({ data: rows.map((r) => ({ ...r, paidAmount: 0, status: "UNPAID" as const })) });
  }

  async listShares(expenseId: string, tx?: Tx): Promise<ExpenseShare[]> {
    const rows = await (tx ?? prisma).expenseShare.findMany({ where: { expenseId }, orderBy: { id: "asc" } });
    return rows.map(toShare);
  }

  async listSharesForExpenses(expenseIds: string[], tx?: Tx): Promise<ExpenseShare[]> {
    if (expenseIds.length === 0) return [];
    const rows = await (tx ?? prisma).expenseShare.findMany({ where: { expenseId: { in: expenseIds } } });
    return rows.map(toShare);
  }

  async listActiveSharesOfDebtors(workspaceId: string, debtorIds: string[], tx?: Tx): Promise<ExpenseShare[]> {
    if (debtorIds.length === 0) return [];
    const rows = await (tx ?? prisma).expenseShare.findMany({
      where: { workspaceId, debtorId: { in: debtorIds }, status: { not: "VOID" } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toShare);
  }

  async listAllActiveShares(workspaceId: string): Promise<ExpenseShare[]> {
    const rows = await prisma.expenseShare.findMany({ where: { workspaceId, status: { not: "VOID" } } });
    return rows.map(toShare);
  }

  async listSharesOfDebtorForExpenses(expenseIds: string[], debtorId: string): Promise<ExpenseShare[]> {
    if (expenseIds.length === 0) return [];
    const rows = await prisma.expenseShare.findMany({ where: { expenseId: { in: expenseIds }, debtorId } });
    return rows.map(toShare);
  }

  async updateShareProjection(id: string, paidAmount: number, status: ExpenseShare["status"], tx: Tx): Promise<void> {
    await tx.expenseShare.update({ where: { id }, data: { paidAmount, status } });
  }

  async deleteShares(expenseId: string, tx: Tx): Promise<void> {
    await tx.expenseShare.deleteMany({ where: { expenseId } });
  }

  async voidShares(expenseId: string, tx: Tx): Promise<void> {
    await tx.expenseShare.updateMany({ where: { expenseId }, data: { status: "VOID" } });
  }

  async sumExpensesSince(workspaceId: string, since: Date): Promise<number> {
    const agg = await prisma.workspaceExpense.aggregate({
      where: { workspaceId, kind: "EXPENSE", deletedAt: null, occurredAt: { gte: since } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  async countExpensesSince(workspaceId: string, since: Date): Promise<number> {
    return prisma.workspaceExpense.count({
      where: { workspaceId, kind: "EXPENSE", deletedAt: null, occurredAt: { gte: since } },
    });
  }
}
