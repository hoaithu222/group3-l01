import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { MarketplacePurchase, PurchaseCreateInput } from "../entities/coins.interface";
import type { IPurchaseRepository } from "./purchase.repository.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";

type PurchaseRecord = Awaited<ReturnType<typeof prisma.marketplacePurchase.findFirstOrThrow>>;

export function toPurchase(r: PurchaseRecord): MarketplacePurchase {
  return { id: r.id, listingId: r.listingId, buyerId: r.buyerId, price: r.price, fee: r.fee, accessRef: r.accessRef, refundedAt: r.refundedAt, createdAt: r.createdAt };
}

export class PrismaPurchaseRepository implements IPurchaseRepository {
  async find(id: string, tx?: TxHandle): Promise<MarketplacePurchase | null> {
    const r = await (tx ?? prisma).marketplacePurchase.findUnique({ where: { id } });
    return r ? toPurchase(r) : null;
  }

  async findByListingAndBuyer(listingId: string, buyerId: string, tx?: TxHandle): Promise<MarketplacePurchase | null> {
    const r = await (tx ?? prisma).marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId, buyerId } } });
    return r ? toPurchase(r) : null;
  }

  async create(data: PurchaseCreateInput, tx: TxHandle): Promise<MarketplacePurchase> {
    try {
      // `accessRef`/`refundedAt` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      return toPurchase(await tx.marketplacePurchase.create({ data: { ...data, accessRef: null, refundedAt: null } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("MarketplacePurchase");
      throw err;
    }
  }

  async setAccessRef(id: string, accessRef: string): Promise<void> {
    await prisma.marketplacePurchase.updateMany({ where: { id }, data: { accessRef } });
  }

  async markRefunded(id: string, at: Date, tx: TxHandle): Promise<void> {
    await tx.marketplacePurchase.updateMany({ where: { id }, data: { refundedAt: at } });
  }

  async listByListingUnrefunded(listingId: string, since: Date): Promise<MarketplacePurchase[]> {
    return (await prisma.marketplacePurchase.findMany({ where: { listingId, refundedAt: null, createdAt: { gte: since } } })).map(toPurchase);
  }

  async listByBuyer(buyerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplacePurchase[]> {
    const after = opts.after;
    const where: Prisma.MarketplacePurchaseWhereInput = { buyerId, ...(after && { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }) };
    return (await prisma.marketplacePurchase.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: opts.limit })).map(toPurchase);
  }
}
