import type { CoinQuest, CoinQuestWrite, QuestProgress } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { CoinQuestPatch, ICoinQuestRepository, IQuestProgressRepository } from "./quest.repository.interface";
import type { TxHandle } from "./tx";

const byOrder = (a: CoinQuest, b: CoinQuest): number => a.order - b.order || (a.code < b.code ? -1 : 1);

export class InMemoryCoinQuestRepository implements ICoinQuestRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async listAll(): Promise<CoinQuest[]> {
    await tick();
    return [...this.store.quests.values()].sort(byOrder).map((q) => ({ ...q }));
  }

  async listActive(): Promise<CoinQuest[]> {
    await tick();
    return [...this.store.quests.values()].filter((q) => q.isActive).sort(byOrder).map((q) => ({ ...q }));
  }

  async find(id: string): Promise<CoinQuest | null> {
    await tick();
    const q = this.store.quests.get(id);
    return q ? { ...q } : null;
  }

  async create(data: CoinQuestWrite, actorId: string): Promise<CoinQuest | null> {
    await tick();
    if ([...this.store.quests.values()].some((q) => q.code === data.code)) return null;
    const quest: CoinQuest = { id: this.store.nextId(), ...data, version: 1, updatedBy: actorId, updatedAt: this.store.now() };
    this.store.quests.set(quest.id, quest);
    return { ...quest };
  }

  async updateIf(id: string, expectedVersion: number, patch: CoinQuestPatch, actorId: string): Promise<CoinQuest | null> {
    await tick();
    const q = this.store.quests.get(id);
    if (!q || q.version !== expectedVersion) return null;
    Object.assign(q, patch, { version: q.version + 1, updatedBy: actorId, updatedAt: this.store.now() });
    return { ...q };
  }
}

export class InMemoryQuestProgressRepository implements IQuestProgressRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  private row(userId: string, questId: string, date: string): QuestProgress | undefined {
    return this.store.progress.find((p) => p.userId === userId && p.questId === questId && p.date === date);
  }

  async ensure(userId: string, questIds: readonly string[], date: string): Promise<void> {
    await tick();
    for (const questId of questIds) {
      if (!this.row(userId, questId, date)) this.store.progress.push({ id: this.store.nextId(), userId, questId, date, progress: 0, claimedAt: null });
    }
  }

  async increment(userId: string, questId: string, date: string, by: number, _tx: TxHandle): Promise<void> {
    await tick();
    const r = this.row(userId, questId, date);
    if (r) r.progress += by;
  }

  async find(userId: string, questId: string, date: string, _tx?: TxHandle): Promise<QuestProgress | null> {
    await tick();
    const r = this.row(userId, questId, date);
    return r ? { ...r } : null;
  }

  async listForDay(userId: string, date: string): Promise<QuestProgress[]> {
    await tick();
    return this.store.progress.filter((p) => p.userId === userId && p.date === date).map((p) => ({ ...p }));
  }

  /** Điều kiện + đặt `claimedAt` NGUYÊN TỬ (không `await` giữa kiểm và ghi). */
  async claimIf(userId: string, questId: string, date: string, target: number, at: Date, _tx: TxHandle): Promise<boolean> {
    await tick();
    const r = this.row(userId, questId, date);
    if (!r || r.progress < target || r.claimedAt !== null) return false;
    r.claimedAt = at;
    return true;
  }
}
