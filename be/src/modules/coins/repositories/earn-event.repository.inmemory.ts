import type { CoinEarnEvent, CoinEarnEventInsert } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { ICoinEarnEventRepository } from "./earn-event.repository.interface";
import { UniqueViolationError, type TxHandle } from "./tx";

export class InMemoryCoinEarnEventRepository implements ICoinEarnEventRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async exists(dedupeKey: string): Promise<boolean> {
    await tick();
    return this.store.earnEvents.some((e) => e.dedupeKey === dedupeKey);
  }

  async create(input: CoinEarnEventInsert, _tx: TxHandle): Promise<CoinEarnEvent> {
    await tick();
    if (this.store.earnEvents.some((e) => e.dedupeKey === input.dedupeKey)) throw new UniqueViolationError("CoinEarnEvent.dedupeKey");
    const row: CoinEarnEvent = { id: this.store.nextId(), at: this.store.now(), ...input };
    this.store.earnEvents.push(row);
    return { ...row };
  }

  async sumCoins(userId: string, localDate: string, sourceType: string | null, _tx?: TxHandle): Promise<number> {
    await tick();
    return this.store.earnEvents.filter((e) => e.userId === userId && e.localDate === localDate && (sourceType === null || e.sourceType === sourceType)).reduce((sum, e) => sum + e.coins, 0);
  }

  async sumBySourceSince(fromLocalDate: string): Promise<Map<string, number>> {
    await tick();
    const out = new Map<string, number>();
    for (const e of this.store.earnEvents) if (e.localDate >= fromLocalDate) out.set(e.sourceType, (out.get(e.sourceType) ?? 0) + e.coins);
    return out;
  }
}
