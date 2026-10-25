import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { LocationReview } from "../entities/o2o.interface";
import type { ILocationReviewRepository, ReviewInput } from "./location.repository.interface";
import { toReview } from "./o2o.mappers";
import type { TxHandle } from "./tx";

const db = (tx?: TxHandle) => tx ?? prisma;

function beforeWhere(before?: { at: Date; id: string }): Prisma.LocationReviewWhereInput {
  if (!before) return {};
  return { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] };
}

/** Đánh giá địa điểm — 1 người/địa điểm (`@@unique([locationId, userId])`); `hiddenAt` luôn ghi null tường minh khi tạo. */
export class PrismaLocationReviewRepository implements ILocationReviewRepository {
  async findMine(locationId: string, userId: string): Promise<LocationReview | null> {
    const r = await prisma.locationReview.findUnique({ where: { locationId_userId: { locationId, userId } } });
    return r ? toReview(r) : null;
  }

  async upsert(locationId: string, userId: string, input: ReviewInput, tx?: TxHandle): Promise<LocationReview> {
    const r = await db(tx).locationReview.upsert({
      where: { locationId_userId: { locationId, userId } },
      create: { locationId, userId, rating: input.rating, noise: input.noise, comment: input.comment, hiddenAt: null },
      update: { rating: input.rating, noise: input.noise, comment: input.comment },
    });
    return toReview(r);
  }

  async deleteMine(locationId: string, userId: string, tx?: TxHandle): Promise<boolean> {
    const res = await db(tx).locationReview.deleteMany({ where: { locationId, userId } });
    return res.count > 0;
  }

  async listVisible(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }): Promise<LocationReview[]> {
    const rows = await prisma.locationReview.findMany({
      where: { locationId, hiddenAt: null, ...beforeWhere(opts.before) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toReview);
  }

  async listAll(locationId: string, opts: { before?: { at: Date; id: string }; limit: number }): Promise<LocationReview[]> {
    const rows = await prisma.locationReview.findMany({
      where: { locationId, ...beforeWhere(opts.before) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toReview);
  }

  async findById(id: string): Promise<LocationReview | null> {
    const r = await prisma.locationReview.findUnique({ where: { id } });
    return r ? toReview(r) : null;
  }

  async setHidden(id: string, hidden: boolean, tx?: TxHandle): Promise<LocationReview | null> {
    const res = await db(tx).locationReview.updateMany({ where: { id }, data: { hiddenAt: hidden ? new Date() : null } });
    if (res.count === 0) return null;
    const r = await db(tx).locationReview.findUnique({ where: { id } });
    return r ? toReview(r) : null;
  }

  async stats(locationId: string, tx?: TxHandle): Promise<{ ratingAvg: number; ratingCount: number; noiseAvg: number }> {
    const agg = await db(tx).locationReview.aggregate({
      where: { locationId, hiddenAt: null },
      _avg: { rating: true, noise: true },
      _count: { _all: true },
    });
    const round1 = (v: number | null) => (v === null ? 0 : Math.round(v * 10) / 10);
    return { ratingAvg: round1(agg._avg.rating), ratingCount: agg._count._all, noiseAvg: round1(agg._avg.noise) };
  }
}
