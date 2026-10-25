import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ListingContentTypeValue, ListingCreateInput, ListingPatch, ListingStatusValue, MarketplaceListing } from "../entities/coins.interface";
import type { IListingRepository, ListingListQuery, ListingPage } from "./listing.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type ListingRecord = Awaited<ReturnType<typeof prisma.marketplaceListing.findFirstOrThrow>>;

export function toListing(r: ListingRecord): MarketplaceListing {
  return {
    id: r.id,
    sellerId: r.sellerId,
    contentType: r.contentType,
    contentId: r.contentId,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    description: r.description,
    tags: [...r.tags],
    price: r.price,
    status: r.status,
    sales: r.sales,
    reportCount: r.reportCount,
    hiddenReason: r.hiddenReason,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const APPROVED_STATUSES: ListingStatusValue[] = ["ACTIVE", "HIDDEN", "WITHDRAWN"];

export class PrismaListingRepository implements IListingRepository {
  async find(id: string, tx?: TxHandle): Promise<MarketplaceListing | null> {
    const r = await (tx ?? prisma).marketplaceListing.findUnique({ where: { id } });
    return r ? toListing(r) : null;
  }

  async findByContent(contentType: ListingContentTypeValue, contentId: string): Promise<MarketplaceListing | null> {
    const r = await prisma.marketplaceListing.findUnique({ where: { contentType_contentId: { contentType, contentId } } });
    return r ? toListing(r) : null;
  }

  async create(data: ListingCreateInput): Promise<MarketplaceListing | null> {
    try {
      return toListing(await prisma.marketplaceListing.create({ data: { ...data, sales: 0, reportCount: 0 } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return null;
      throw err;
    }
  }

  async updateIf(id: string, expectedVersion: number, patch: ListingPatch): Promise<MarketplaceListing | null> {
    const res = await prisma.marketplaceListing.updateMany({ where: { id, version: expectedVersion }, data: { ...patch, version: { increment: 1 } } });
    return res.count > 0 ? this.find(id) : null;
  }

  async setStatus(id: string, status: ListingStatusValue, patch: { hiddenReason?: string | null }): Promise<MarketplaceListing | null> {
    const res = await prisma.marketplaceListing.updateMany({ where: { id }, data: { status, ...patch } });
    return res.count > 0 ? this.find(id) : null;
  }

  async incrementSales(id: string, tx: TxHandle): Promise<void> {
    await tx.marketplaceListing.updateMany({ where: { id }, data: { sales: { increment: 1 } } });
  }

  async incrementReportCount(id: string): Promise<MarketplaceListing | null> {
    try {
      return toListing(await prisma.marketplaceListing.update({ where: { id }, data: { reportCount: { increment: 1 } } }));
    } catch {
      return null;
    }
  }

  async listActive(query: ListingListQuery): Promise<ListingPage> {
    const where: Prisma.MarketplaceListingWhereInput = {
      status: "ACTIVE",
      ...(query.contentType && { contentType: query.contentType }),
      ...(query.q && { normalizedTitle: { contains: query.q } }),
    };
    const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] =
      query.sort === "popular" ? [{ sales: "desc" }, { createdAt: "desc" }] : query.sort === "price" ? [{ price: "asc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
    const rows = await prisma.marketplaceListing.findMany({ where, orderBy, skip: query.offset, take: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    return { items: (hasMore ? rows.slice(0, query.limit) : rows).map(toListing), hasMore };
  }

  async listBySeller(sellerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]> {
    const after = opts.after;
    const where: Prisma.MarketplaceListingWhereInput = { sellerId, ...(after && { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }) };
    return (await prisma.marketplaceListing.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: opts.limit })).map(toListing);
  }

  async listPending(opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]> {
    const after = opts.after;
    const where: Prisma.MarketplaceListingWhereInput = {
      status: "PENDING_REVIEW",
      ...(after && { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }),
    };
    return (await prisma.marketplaceListing.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: opts.limit })).map(toListing);
  }

  async listReported(opts: { offset: number; limit: number }): Promise<ListingPage> {
    const rows = await prisma.marketplaceListing.findMany({
      where: { reportCount: { gt: 0 }, status: { in: ["ACTIVE", "HIDDEN"] } },
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
      skip: opts.offset,
      take: opts.limit + 1,
    });
    const hasMore = rows.length > opts.limit;
    return { items: (hasMore ? rows.slice(0, opts.limit) : rows).map(toListing), hasMore };
  }

  async countActiveOrPending(sellerId: string): Promise<number> {
    return prisma.marketplaceListing.count({ where: { sellerId, status: { in: ["PENDING_REVIEW", "ACTIVE"] } } });
  }

  async hasApprovedListing(sellerId: string): Promise<boolean> {
    return (await prisma.marketplaceListing.count({ where: { sellerId, status: { in: APPROVED_STATUSES } } })) > 0;
  }
}
