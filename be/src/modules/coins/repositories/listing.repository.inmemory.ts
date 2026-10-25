import type { ListingContentTypeValue, ListingCreateInput, ListingPatch, ListingStatusValue, MarketplaceListing } from "../entities/coins.interface";
import { tick, type InMemoryCoinsStore } from "./coins-store.inmemory";
import type { IListingRepository, ListingListQuery, ListingPage } from "./listing.repository.interface";
import type { TxHandle } from "./tx";

const APPROVED_STATUSES = new Set<ListingStatusValue>(["ACTIVE", "HIDDEN", "WITHDRAWN"]);

export class InMemoryListingRepository implements IListingRepository {
  constructor(private readonly store: InMemoryCoinsStore) {}

  async find(id: string, _tx?: TxHandle): Promise<MarketplaceListing | null> {
    await tick();
    const l = this.store.listings.get(id);
    return l ? { ...l } : null;
  }

  async findByContent(contentType: ListingContentTypeValue, contentId: string): Promise<MarketplaceListing | null> {
    await tick();
    const l = [...this.store.listings.values()].find((x) => x.contentType === contentType && x.contentId === contentId);
    return l ? { ...l } : null;
  }

  async create(data: ListingCreateInput): Promise<MarketplaceListing | null> {
    await tick();
    if ([...this.store.listings.values()].some((l) => l.contentType === data.contentType && l.contentId === data.contentId)) return null;
    const now = this.store.now();
    const listing: MarketplaceListing = { id: this.store.nextId(), ...data, sales: 0, reportCount: 0, version: 1, createdAt: now, updatedAt: now };
    this.store.listings.set(listing.id, listing);
    return { ...listing };
  }

  async updateIf(id: string, expectedVersion: number, patch: ListingPatch): Promise<MarketplaceListing | null> {
    await tick();
    const l = this.store.listings.get(id);
    if (!l || l.version !== expectedVersion) return null;
    Object.assign(l, patch, { version: l.version + 1, updatedAt: this.store.now() });
    return { ...l };
  }

  async setStatus(id: string, status: ListingStatusValue, patch: { hiddenReason?: string | null }): Promise<MarketplaceListing | null> {
    await tick();
    const l = this.store.listings.get(id);
    if (!l) return null;
    l.status = status;
    if ("hiddenReason" in patch) l.hiddenReason = patch.hiddenReason ?? null;
    l.updatedAt = this.store.now();
    return { ...l };
  }

  async incrementSales(id: string, _tx: TxHandle): Promise<void> {
    await tick();
    const l = this.store.listings.get(id);
    if (l) l.sales += 1;
  }

  async incrementReportCount(id: string): Promise<MarketplaceListing | null> {
    await tick();
    const l = this.store.listings.get(id);
    if (!l) return null;
    l.reportCount += 1;
    return { ...l };
  }

  async listActive(query: ListingListQuery): Promise<ListingPage> {
    await tick();
    let rows = [...this.store.listings.values()].filter((l) => l.status === "ACTIVE");
    if (query.contentType) rows = rows.filter((l) => l.contentType === query.contentType);
    if (query.q) rows = rows.filter((l) => l.normalizedTitle.includes(query.q!));
    rows.sort((a, b) =>
      query.sort === "popular"
        ? b.sales - a.sales || b.createdAt.getTime() - a.createdAt.getTime()
        : query.sort === "price"
          ? a.price - b.price || b.createdAt.getTime() - a.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime()
    );
    const page = rows.slice(query.offset, query.offset + query.limit + 1);
    const hasMore = page.length > query.limit;
    return { items: (hasMore ? page.slice(0, query.limit) : page).map((l) => ({ ...l })), hasMore };
  }

  async listBySeller(sellerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]> {
    await tick();
    return this.byCreatedAtDesc(
      [...this.store.listings.values()].filter((l) => l.sellerId === sellerId),
      opts
    );
  }

  async listPending(opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]> {
    await tick();
    return this.byCreatedAtDesc(
      [...this.store.listings.values()].filter((l) => l.status === "PENDING_REVIEW"),
      opts
    );
  }

  async listReported(opts: { offset: number; limit: number }): Promise<ListingPage> {
    await tick();
    const rows = [...this.store.listings.values()]
      .filter((l) => l.reportCount > 0 && (l.status === "ACTIVE" || l.status === "HIDDEN"))
      .sort((a, b) => b.reportCount - a.reportCount || b.createdAt.getTime() - a.createdAt.getTime());
    const page = rows.slice(opts.offset, opts.offset + opts.limit + 1);
    const hasMore = page.length > opts.limit;
    return { items: (hasMore ? page.slice(0, opts.limit) : page).map((l) => ({ ...l })), hasMore };
  }

  async countActiveOrPending(sellerId: string): Promise<number> {
    await tick();
    return [...this.store.listings.values()].filter((l) => l.sellerId === sellerId && (l.status === "PENDING_REVIEW" || l.status === "ACTIVE")).length;
  }

  async hasApprovedListing(sellerId: string): Promise<boolean> {
    await tick();
    return [...this.store.listings.values()].some((l) => l.sellerId === sellerId && APPROVED_STATUSES.has(l.status));
  }

  private byCreatedAtDesc(rows: MarketplaceListing[], opts: { after?: { at: Date; id: string }; limit: number }): MarketplaceListing[] {
    const after = opts.after;
    return rows
      .filter((l) => !after || l.createdAt.getTime() < after.at.getTime() || (l.createdAt.getTime() === after.at.getTime() && l.id < after.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, opts.limit)
      .map((l) => ({ ...l }));
  }
}
