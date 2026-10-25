import type { CoinRule, CoinRuleWrite, CoinSourceTypeValue } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { ICoinRuleRepository } from "./rule.repository.interface";

export class InMemoryCoinRuleRepository implements ICoinRuleRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async listAll(): Promise<CoinRule[]> {
    await tick();
    return [...this.store.rules.values()].sort((a, b) => (a.sourceType < b.sourceType ? -1 : 1)).map((r) => ({ ...r }));
  }

  async find(sourceType: CoinSourceTypeValue): Promise<CoinRule | null> {
    await tick();
    const r = this.store.rules.get(sourceType);
    return r ? { ...r } : null;
  }

  async create(sourceType: CoinSourceTypeValue, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null> {
    await tick();
    if (this.store.rules.has(sourceType)) return null;
    const rule: CoinRule = { id: this.store.nextId(), sourceType, ...data, version: 1, updatedBy: actorId, updatedAt: this.store.now() };
    this.store.rules.set(sourceType, rule);
    return { ...rule };
  }

  async updateIf(sourceType: CoinSourceTypeValue, expectedVersion: number, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null> {
    await tick();
    const r = this.store.rules.get(sourceType);
    if (!r || r.version !== expectedVersion) return null;
    Object.assign(r, data, { version: r.version + 1, updatedBy: actorId, updatedAt: this.store.now() });
    return { ...r };
  }
}
