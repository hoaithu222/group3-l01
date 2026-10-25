import type { MarketplacePurchase, PurchaseCreateInput } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { IPurchaseRepository } from "./purchase.repository.interface";
import { UniqueViolationError, type TxHandle } from "./tx";

export class InMemoryPurchaseRepository implements IPurchaseRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async find(id: string, _tx?: TxHandle): Promise<MarketplacePurchase | null> {
    await tick();
    const p = this.store.purchases.find((x) => x.id === id);
    return p ? { ...p } : null;
  }

  async findByListingAndBuyer(listingId: string, buyerId: string, _tx?: TxHandle): Promise<MarketplacePurchase | null> {
    await tick();
    const p = this.store.purchases.find((x) => x.listingId === listingId && x.buyerId === buyerId);
    return p ? { ...p } : null;
  }

  async create(data: PurchaseCreateInput, _tx: TxHandle): Promise<MarketplacePurchase> {
    await tick();
    if (this.store.purchases.some((x) => x.listingId === data.listingId && x.buyerId === data.buyerId)) throw new UniqueViolationError("MarketplacePurchase");
    const row: MarketplacePurchase = { id: this.store.nextId(), ...data, accessRef: null, refundedAt: null, createdAt: this.store.now() };
    this.store.purchases.push(row);
    return { ...row };
  }

  async setAccessRef(id: string, accessRef: string): Promise<void> {
    await tick();
    const p = this.store.purchases.find((x) => x.id === id);
    if (p) p.accessRef = accessRef;
  }

  async markRefunded(id: string, at: Date, _tx: TxHandle): Promise<void> {
    await tick();
    const p = this.store.purchases.find((x) => x.id === id);
    if (p) p.refundedAt = at;
  }

  async listByListingUnrefunded(listingId: string, since: Date): Promise<MarketplacePurchase[]> {
    await tick();
    return this.store.purchases.filter((p) => p.listingId === listingId && p.refundedAt === null && p.createdAt.getTime() >= since.getTime()).map((p) => ({ ...p }));
  }

  async listByBuyer(buyerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplacePurchase[]> {
    await tick();
    const after = opts.after;
    return this.store.purchases
      .filter((p) => p.buyerId === buyerId && (!after || p.createdAt.getTime() < after.at.getTime() || (p.createdAt.getTime() === after.at.getTime() && p.id < after.id)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, opts.limit)
      .map((p) => ({ ...p }));
  }
}
