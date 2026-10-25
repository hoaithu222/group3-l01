import { newObjectId } from "../../../core/utils/object-id";
import type { PrintOrder, PrintOrderEvent, PrintOrderStatus, PrintShop, PrintShopStatus } from "../entities/o2o.interface";
import type { AdminShopFilter, IPrintShopRepository, ShopCreateInput, ShopPatch, ShopStatusPatch } from "./print-shop.repository.interface";
import type {
  AdminOrderFilter,
  DueKind,
  IPrintOrderRepository,
  OrderCreateInput,
  OrderCursor,
  OrderSetPatch,
  OrderTransition,
} from "./print-order.repository.interface";

/** Repo in-memory cho unit test — cùng ngữ nghĩa CAS với bản Prisma. */
export class InMemoryPrintShopRepository implements IPrintShopRepository {
  readonly rows = new Map<string, PrintShop>();

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByLocationId(locationId: string) {
    return [...this.rows.values()].find((s) => s.locationId === locationId) ?? null;
  }
  async findByLocationIds(ids: string[]) {
    return [...this.rows.values()].filter((s) => ids.includes(s.locationId));
  }
  async listByOwner(ownerUserId: string) {
    return [...this.rows.values()].filter((s) => s.ownerUserId === ownerUserId);
  }
  async hasApprovedForOwner(ownerUserId: string) {
    return [...this.rows.values()].some((s) => s.ownerUserId === ownerUserId && s.status === "APPROVED");
  }
  async create(input: ShopCreateInput): Promise<PrintShop> {
    const now = new Date();
    const shop: PrintShop = {
      id: newObjectId(),
      ...input,
      status: "PENDING",
      approvedBy: null,
      approvedAt: null,
      suspendedReason: null,
      acceptingOrders: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(shop.id, shop);
    return shop;
  }
  async update(id: string, expectedVersion: number, patch: ShopPatch) {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== expectedVersion) return null;
    const next: PrintShop = { ...cur, ...patch, version: cur.version + 1, updatedAt: new Date() };
    this.rows.set(id, next);
    return next;
  }
  async setStatus(id: string, from: readonly PrintShopStatus[], patch: ShopStatusPatch) {
    const cur = this.rows.get(id);
    if (!cur || !from.includes(cur.status)) return null;
    const next: PrintShop = {
      ...cur,
      status: patch.status,
      ...(patch.approvedBy !== undefined && { approvedBy: patch.approvedBy }),
      ...(patch.approvedAt !== undefined && { approvedAt: patch.approvedAt }),
      ...(patch.suspendedReason !== undefined && { suspendedReason: patch.suspendedReason }),
    };
    this.rows.set(id, next);
    return next;
  }
  async setAccepting(id: string, ownerUserId: string, acceptingOrders: boolean) {
    const cur = this.rows.get(id);
    if (!cur || cur.ownerUserId !== ownerUserId) return null;
    const next = { ...cur, acceptingOrders };
    this.rows.set(id, next);
    return next;
  }
  async listAdmin(f: AdminShopFilter) {
    const all = [...this.rows.values()].filter((s) => !f.status || s.status === f.status);
    return { data: all.slice((f.page - 1) * f.limit, f.page * f.limit), total: all.length };
  }
}

const ACTIVE_CUTOFF: Record<DueKind, (o: PrintOrder, t: Date) => boolean> = {
  PENDING_EXPIRE: (o, t) => o.status === "PENDING" && o.submittedAt !== null && o.submittedAt < t,
  READY_EXPIRE: (o, t) => o.status === "READY" && o.readyAt !== null && o.readyAt < t,
  READY_EXPIRING: (o, t) => o.status === "READY" && o.readyAt !== null && o.readyAt < t && o.expiringNotifiedAt === null,
  DRAFT_ABANDON: (o, t) => (o.status === "DRAFT" || o.status === "QUOTED") && o.createdAt < t,
};

export class InMemoryPrintOrderRepository implements IPrintOrderRepository {
  readonly rows = new Map<string, PrintOrder>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async create(input: OrderCreateInput): Promise<PrintOrder> {
    if ([...this.rows.values()].some((o) => o.code === input.code)) throw Object.assign(new Error("dup"), { code: "P2002" });
    const now = this.clock();
    const { event, ...rest } = input;
    const order: PrintOrder = {
      id: newObjectId(),
      ...rest,
      pages: null,
      pageCountError: null,
      quote: null,
      pinHash: null,
      status: "DRAFT",
      payment: { method: "AT_COUNTER", status: "UNPAID", confirmedBy: null, confirmedAt: null },
      events: [event],
      rejectReason: null,
      cancelReason: null,
      submittedAt: null,
      readyAt: null,
      pickedUpAt: null,
      fileAccessUntil: null,
      expiringNotifiedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(order.id, order);
    return order;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  private apply(cur: PrintOrder, set: OrderSetPatch, event?: PrintOrderEvent): PrintOrder {
    const defined = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)) as Partial<PrintOrder>;
    const next: PrintOrder = { ...cur, ...defined, events: event ? [...cur.events, event] : cur.events, version: cur.version + 1, updatedAt: this.clock() };
    this.rows.set(cur.id, next);
    return next;
  }
  async transition(id: string, t: OrderTransition) {
    const cur = this.rows.get(id);
    if (!cur || cur.status !== t.from || cur.version !== t.version) return null;
    return this.apply(cur, t.set, t.event);
  }
  async setPageCount(id: string, assetId: string, set: OrderSetPatch, event?: PrintOrderEvent) {
    const cur = this.rows.get(id);
    if (!cur || cur.fileAssetId !== assetId || (cur.status !== "DRAFT" && cur.status !== "QUOTED")) return null;
    return this.apply(cur, set, event);
  }
  private page(rows: PrintOrder[], statuses?: readonly PrintOrderStatus[], before?: OrderCursor, limit = 20) {
    return rows
      .filter((o) => !statuses || statuses.includes(o.status))
      .filter((o) => !before || o.createdAt < before.at || (o.createdAt.getTime() === before.at.getTime() && o.id < before.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }
  async listByUser(userId: string, o: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }) {
    return this.page([...this.rows.values()].filter((x) => x.userId === userId), o.statuses, o.before, o.limit);
  }
  async listForOwner(ownerUserId: string, o: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }) {
    const rows = [...this.rows.values()].filter((x) => x.shopOwnerId === ownerUserId && x.submittedAt !== null);
    return this.page(rows, o.statuses, o.before, o.limit);
  }
  async listAdmin(f: AdminOrderFilter) {
    const all = [...this.rows.values()].filter((o) => (!f.shopId || o.shopId === f.shopId) && (!f.status || o.status === f.status));
    return { data: all.slice((f.page - 1) * f.limit, f.page * f.limit), total: all.length };
  }
  async findDue(kind: DueKind, threshold: Date, limit: number) {
    return [...this.rows.values()].filter((o) => ACTIVE_CUTOFF[kind](o, threshold)).slice(0, limit);
  }
  async countByShopsSince(shopIds: string[], since: Date) {
    const out = new Map<string, number>();
    for (const o of this.rows.values()) {
      if (shopIds.includes(o.shopId) && o.submittedAt && o.submittedAt >= since) out.set(o.shopId, (out.get(o.shopId) ?? 0) + 1);
    }
    return out;
  }
  async countByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[]) {
    return [...this.rows.values()].filter((o) => o.shopId === shopId && statuses.includes(o.status)).length;
  }
  async listByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[], limit: number) {
    return [...this.rows.values()].filter((o) => o.shopId === shopId && statuses.includes(o.status)).slice(0, limit);
  }
}
