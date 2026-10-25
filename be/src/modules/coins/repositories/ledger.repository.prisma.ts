import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CoinLedgerKey, CoinRefTypeValue, CoinTransaction, CoinTransactionInsert, CoinTxTypeValue } from "../entities/coins.interface";
import type { ICoinLedgerRepository, LedgerTypeTotal } from "./ledger.repository.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";

type LedgerRecord = Awaited<ReturnType<typeof prisma.coinTransaction.findFirstOrThrow>>;

export function toCoinTransaction(r: LedgerRecord): CoinTransaction {
  return {
    id: r.id,
    userId: r.userId,
    amount: r.amount,
    type: r.type,
    refType: r.refType as CoinRefTypeValue,
    refId: r.refId,
    balanceAfter: r.balanceAfter,
    counterpartyId: r.counterpartyId,
    note: r.note,
    actorId: r.actorId,
    at: r.at,
  };
}

export class PrismaCoinLedgerRepository implements ICoinLedgerRepository {
  async findByKey(key: CoinLedgerKey, tx?: TxHandle): Promise<CoinTransaction | null> {
    const r = await (tx ?? prisma).coinTransaction.findUnique({ where: { type_refType_refId_userId: key } });
    return r ? toCoinTransaction(r) : null;
  }

  async insert(input: CoinTransactionInsert, tx: TxHandle): Promise<CoinTransaction> {
    try {
      // Trường tuỳ chọn ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      return toCoinTransaction(await tx.coinTransaction.create({ data: input }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("CoinTransaction");
      throw err;
    }
  }

  async listByUser(userId: string, opts: { type?: CoinTxTypeValue; after?: { at: Date; id: string }; limit: number }): Promise<CoinTransaction[]> {
    const after = opts.after;
    const where: Prisma.CoinTransactionWhereInput = {
      userId,
      ...(opts.type && { type: opts.type }),
      ...(after && { OR: [{ at: { lt: after.at } }, { at: after.at, id: { lt: after.id } }] }),
    };
    return (await prisma.coinTransaction.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: opts.limit })).map(toCoinTransaction);
  }

  async sumByUsers(userIds: readonly string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.coinTransaction.groupBy({ by: ["userId"], where: { userId: { in: [...userIds] } }, _sum: { amount: true } });
    return new Map(rows.map((r) => [r.userId, r._sum.amount ?? 0]));
  }

  async totalsByType(from: Date, to: Date): Promise<Map<CoinTxTypeValue, LedgerTypeTotal>> {
    const rows = await prisma.coinTransaction.groupBy({ by: ["type"], where: { at: { gte: from, lt: to } }, _sum: { amount: true }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.type, { sum: r._sum.amount ?? 0, count: r._count._all }]));
  }
}
