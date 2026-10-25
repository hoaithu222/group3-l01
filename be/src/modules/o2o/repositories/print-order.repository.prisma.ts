import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PrintOrder, PrintOrderEvent, PrintOrderStatus } from "../entities/o2o.interface";
import type {
  AdminOrderFilter,
  DueKind,
  IPrintOrderRepository,
  OrderCreateInput,
  OrderCursor,
  OrderSetPatch,
  OrderTransition,
} from "./print-order.repository.interface";
import { toOrder } from "./o2o.mappers";
import type { TxHandle } from "./tx";

const db = (tx?: TxHandle) => tx ?? prisma;

/** Patch miền → dữ liệu Prisma (composite `set`, danh sách `push`). */
function toData(set: OrderSetPatch, event?: PrintOrderEvent): Prisma.PrintOrderUpdateManyMutationInput {
  const data: Prisma.PrintOrderUpdateManyMutationInput = { version: { increment: 1 } };
  if (set.status !== undefined) data.status = set.status;
  if (set.settings !== undefined) data.settings = { set: set.settings };
  if (set.pages !== undefined) data.pages = set.pages;
  if (set.pageCountError !== undefined) data.pageCountError = set.pageCountError;
  if (set.quote !== undefined) data.quote = set.quote === null ? { set: null } : { set: set.quote };
  if (set.pinHash !== undefined) data.pinHash = set.pinHash;
  if (set.payment !== undefined) data.payment = { set: set.payment };
  if (set.rejectReason !== undefined) data.rejectReason = set.rejectReason;
  if (set.cancelReason !== undefined) data.cancelReason = set.cancelReason;
  if (set.pickupBy !== undefined) data.pickupBy = set.pickupBy;
  if (set.submittedAt !== undefined) data.submittedAt = set.submittedAt;
  if (set.readyAt !== undefined) data.readyAt = set.readyAt;
  if (set.pickedUpAt !== undefined) data.pickedUpAt = set.pickedUpAt;
  if (set.fileAccessUntil !== undefined) data.fileAccessUntil = set.fileAccessUntil;
  if (set.expiringNotifiedAt !== undefined) data.expiringNotifiedAt = set.expiringNotifiedAt;
  if (event) data.events = { push: [event] };
  return data;
}

function beforeWhere(before?: OrderCursor): Prisma.PrintOrderWhereInput {
  if (!before) return {};
  return { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] };
}

const DUE_WHERE: Record<DueKind, (t: Date) => Prisma.PrintOrderWhereInput> = {
  PENDING_EXPIRE: (t) => ({ status: "PENDING", submittedAt: { lt: t, not: null } }),
  READY_EXPIRE: (t) => ({ status: "READY", readyAt: { lt: t, not: null } }),
  READY_EXPIRING: (t) => ({ status: "READY", readyAt: { lt: t, not: null }, expiringNotifiedAt: null }),
  DRAFT_ABANDON: (t) => ({ status: { in: ["DRAFT", "QUOTED"] }, createdAt: { lt: t } }),
};

export class PrismaPrintOrderRepository implements IPrintOrderRepository {
  async create(input: OrderCreateInput, tx?: TxHandle): Promise<PrintOrder> {
    const { event, ...rest } = input;
    const r = await db(tx).printOrder.create({
      data: {
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
      },
    });
    return toOrder(r);
  }

  async findById(id: string): Promise<PrintOrder | null> {
    const r = await prisma.printOrder.findUnique({ where: { id } });
    return r ? toOrder(r) : null;
  }

  async transition(id: string, t: OrderTransition, tx?: TxHandle): Promise<PrintOrder | null> {
    const res = await db(tx).printOrder.updateMany({ where: { id, status: t.from, version: t.version }, data: toData(t.set, t.event) });
    if (res.count === 0) return null;
    const r = await db(tx).printOrder.findUnique({ where: { id } });
    return r ? toOrder(r) : null;
  }

  async setPageCount(id: string, assetId: string, set: OrderSetPatch, event?: PrintOrderEvent): Promise<PrintOrder | null> {
    const res = await prisma.printOrder.updateMany({
      where: { id, fileAssetId: assetId, status: { in: ["DRAFT", "QUOTED"] } },
      data: toData(set, event),
    });
    return res.count === 0 ? null : this.findById(id);
  }

  async listByUser(userId: string, opts: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }): Promise<PrintOrder[]> {
    const rows = await prisma.printOrder.findMany({
      where: { userId, ...(opts.statuses && { status: { in: [...opts.statuses] } }), ...beforeWhere(opts.before) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toOrder);
  }

  async listForOwner(ownerUserId: string, opts: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }): Promise<PrintOrder[]> {
    const rows = await prisma.printOrder.findMany({
      where: {
        shopOwnerId: ownerUserId,
        submittedAt: { not: null },
        ...(opts.statuses && { status: { in: [...opts.statuses] } }),
        ...beforeWhere(opts.before),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toOrder);
  }

  async listAdmin(f: AdminOrderFilter): Promise<{ data: PrintOrder[]; total: number }> {
    const where: Prisma.PrintOrderWhereInput = {
      ...(f.shopId && { shopId: f.shopId }),
      ...(f.status && { status: f.status }),
      ...(f.paymentStatus && { payment: { is: { status: f.paymentStatus } } }),
      ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lt: f.to }) } }),
      ...(f.code && { code: f.code.toUpperCase() }),
    };
    const [rows, total] = await Promise.all([
      prisma.printOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.printOrder.count({ where }),
    ]);
    return { data: rows.map(toOrder), total };
  }

  async findDue(kind: DueKind, threshold: Date, limit: number): Promise<PrintOrder[]> {
    const rows = await prisma.printOrder.findMany({ where: DUE_WHERE[kind](threshold), orderBy: { createdAt: "asc" }, take: limit });
    return rows.map(toOrder);
  }

  async countByShopsSince(shopIds: string[], since: Date): Promise<Map<string, number>> {
    if (shopIds.length === 0) return new Map();
    const groups = await prisma.printOrder.groupBy({
      by: ["shopId"],
      where: { shopId: { in: shopIds }, submittedAt: { gte: since, not: null } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.shopId, g._count._all]));
  }

  async countByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[]): Promise<number> {
    return prisma.printOrder.count({ where: { shopId, status: { in: [...statuses] } } });
  }

  async listByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[], limit: number): Promise<PrintOrder[]> {
    const rows = await prisma.printOrder.findMany({ where: { shopId, status: { in: [...statuses] } }, orderBy: { createdAt: "asc" }, take: limit });
    return rows.map(toOrder);
  }
}
