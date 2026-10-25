import type { WalletDelta } from "../domain/coin-math";
import type { CoinWallet } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { TxHandle } from "./tx";
import type { ApplyDeltaResult, ICoinWalletRepository } from "./wallet.repository.interface";

export class InMemoryCoinWalletRepository implements ICoinWalletRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async ensure(userId: string): Promise<void> {
    await tick();
    if (this.store.wallets.has(userId)) return;
    const at = this.store.now();
    this.store.wallets.set(userId, { id: this.store.nextId(), userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, version: 1, createdAt: at, updatedAt: at });
  }

  async find(userId: string, _tx?: TxHandle): Promise<CoinWallet | null> {
    await tick();
    const w = this.store.wallets.get(userId);
    return w ? { ...w } : null;
  }

  /** Điều kiện + cập nhật NGUYÊN TỬ (không `await` giữa kiểm và ghi) — mô phỏng `updateMany` có điều kiện của Mongo trên một document. */
  async applyDelta(userId: string, delta: WalletDelta, maxBalance: number, _tx: TxHandle): Promise<ApplyDeltaResult> {
    await tick();
    const w = this.store.wallets.get(userId);
    if (!w) return { ok: false, reason: "MISSING" };
    const after = w.balance + delta.balance;
    if (after < 0) return { ok: false, reason: "INSUFFICIENT" };
    if (after > maxBalance) return { ok: false, reason: "OVER_LIMIT" };
    w.balance = after;
    w.lifetimeEarned += delta.earned;
    w.lifetimeSpent += delta.spent;
    w.version += 1;
    w.updatedAt = this.store.now();
    return { ok: true, wallet: { ...w } };
  }

  async listPage(opts: { afterUserId?: string; limit: number }): Promise<CoinWallet[]> {
    await tick();
    return [...this.store.wallets.values()]
      .filter((w) => !opts.afterUserId || w.userId > opts.afterUserId)
      .sort((a, b) => (a.userId < b.userId ? -1 : 1))
      .slice(0, opts.limit)
      .map((w) => ({ ...w }));
  }

  async totalBalance(): Promise<number> {
    await tick();
    return [...this.store.wallets.values()].reduce((sum, w) => sum + w.balance, 0);
  }
}
