import { prisma } from "../../../infrastructure/database";
import type { WalletDelta } from "../domain/coin-math";
import type { CoinWallet } from "../entities/coins.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";
import type { ApplyDeltaResult, ICoinWalletRepository } from "./wallet.repository.interface";

type WalletRecord = Awaited<ReturnType<typeof prisma.coinWallet.findFirstOrThrow>>;

export function toCoinWallet(r: WalletRecord): CoinWallet {
  return { id: r.id, userId: r.userId, balance: r.balance, lifetimeEarned: r.lifetimeEarned, lifetimeSpent: r.lifetimeSpent, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export class PrismaCoinWalletRepository implements ICoinWalletRepository {
  async ensure(userId: string): Promise<void> {
    if (await prisma.coinWallet.findUnique({ where: { userId }, select: { id: true } })) return;
    try {
      await prisma.coinWallet.create({ data: { userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async find(userId: string, tx?: TxHandle): Promise<CoinWallet | null> {
    const r = await (tx ?? prisma).coinWallet.findUnique({ where: { userId } });
    return r ? toCoinWallet(r) : null;
  }

  async applyDelta(userId: string, delta: WalletDelta, maxBalance: number, tx: TxHandle): Promise<ApplyDeltaResult> {
    // Điều kiện nằm TRONG `where` của `updateMany` (một thao tác nguyên tử trên document ví): số dư trước phải đủ để trừ (`≥ −delta`) và không đẩy sau-cộng vượt trần.
    const min = delta.balance < 0 ? -delta.balance : 0;
    const max = maxBalance - Math.max(delta.balance, 0);
    const res = await tx.coinWallet.updateMany({
      where: { userId, balance: { gte: min, lte: max } },
      data: { balance: { increment: delta.balance }, lifetimeEarned: { increment: delta.earned }, lifetimeSpent: { increment: delta.spent }, version: { increment: 1 } },
    });
    const wallet = await tx.coinWallet.findUnique({ where: { userId } });
    if (res.count === 0) {
      if (!wallet) return { ok: false, reason: "MISSING" };
      return { ok: false, reason: delta.balance < 0 ? "INSUFFICIENT" : "OVER_LIMIT" };
    }
    // Đọc lại trong CÙNG transaction: `balanceAfter` của dòng sổ cái lấy từ đây nên luôn khớp thay đổi vừa ghi.
    if (!wallet) return { ok: false, reason: "MISSING" };
    return { ok: true, wallet: toCoinWallet(wallet) };
  }

  async listPage(opts: { afterUserId?: string; limit: number }): Promise<CoinWallet[]> {
    const rows = await prisma.coinWallet.findMany({ where: opts.afterUserId ? { userId: { gt: opts.afterUserId } } : {}, orderBy: { userId: "asc" }, take: opts.limit });
    return rows.map(toCoinWallet);
  }

  async totalBalance(): Promise<number> {
    const agg = await prisma.coinWallet.aggregate({ _sum: { balance: true } });
    return agg._sum.balance ?? 0;
  }
}
