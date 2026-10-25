import type { CoinLedgerKey, CoinTransaction, CoinTransactionInsert, CoinTxTypeValue } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { ICoinLedgerRepository, LedgerTypeTotal } from "./ledger.repository.interface";
import { UniqueViolationError, type TxHandle } from "./tx";

const sameKey = (a: CoinLedgerKey, b: CoinLedgerKey): boolean => a.type === b.type && a.refType === b.refType && a.refId === b.refId && a.userId === b.userId;

export class InMemoryCoinLedgerRepository implements ICoinLedgerRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async findByKey(key: CoinLedgerKey, _tx?: TxHandle): Promise<CoinTransaction | null> {
    await tick();
    const found = this.store.ledger.find((r) => sameKey(r, key));
    return found ? { ...found } : null;
  }

  /** Cưỡng chế unique `(type, refType, refId, userId)` như index thật — trùng ⇒ `UniqueViolationError`. */
  async insert(input: CoinTransactionInsert, _tx: TxHandle): Promise<CoinTransaction> {
    await tick();
    if (this.store.ledger.some((r) => sameKey(r, input))) throw new UniqueViolationError("CoinTransaction");
    const row: CoinTransaction = { id: this.store.nextId(), at: this.store.now(), ...input };
    this.store.ledger.push(row);
    return { ...row };
  }

  async listByUser(userId: string, opts: { type?: CoinTxTypeValue; after?: { at: Date; id: string }; limit: number }): Promise<CoinTransaction[]> {
    await tick();
    const after = opts.after;
    return this.store.ledger
      .filter((r) => r.userId === userId && (!opts.type || r.type === opts.type))
      .filter((r) => !after || r.at < after.at || (r.at.getTime() === after.at.getTime() && r.id < after.id))
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, opts.limit)
      .map((r) => ({ ...r }));
  }

  async sumByUsers(userIds: readonly string[]): Promise<Map<string, number>> {
    await tick();
    const wanted = new Set(userIds);
    const out = new Map<string, number>();
    for (const r of this.store.ledger) if (wanted.has(r.userId)) out.set(r.userId, (out.get(r.userId) ?? 0) + r.amount);
    return out;
  }

  async totalsByType(from: Date, to: Date): Promise<Map<CoinTxTypeValue, LedgerTypeTotal>> {
    await tick();
    const out = new Map<CoinTxTypeValue, LedgerTypeTotal>();
    for (const r of this.store.ledger) {
      if (r.at < from || r.at >= to) continue;
      const cur = out.get(r.type) ?? { sum: 0, count: 0 };
      out.set(r.type, { sum: cur.sum + r.amount, count: cur.count + 1 });
    }
    return out;
  }
}
