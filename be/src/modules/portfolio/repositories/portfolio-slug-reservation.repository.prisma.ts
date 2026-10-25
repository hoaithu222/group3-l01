import type { PortfolioSlugReservation as PrismaReservation } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { SlugReservation } from "../entities/portfolio.interface";
import type { IPortfolioSlugReservationRepository, ReservationInput } from "./portfolio-slug-reservation.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

const toReservation = (r: PrismaReservation): SlugReservation => ({
  id: r.id,
  slugKey: r.slugKey,
  portfolioId: r.portfolioId,
  redirectTo: r.redirectTo ?? null,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
});

const dbOf = (tx?: TxHandle) => tx ?? prisma;

export class PrismaPortfolioSlugReservationRepository implements IPortfolioSlugReservationRepository {
  async findByKey(slugKey: string, tx?: TxHandle): Promise<SlugReservation | null> {
    const r = await dbOf(tx).portfolioSlugReservation.findUnique({ where: { slugKey } });
    return r ? toReservation(r) : null;
  }

  /** `updateMany` rồi `create` (không `upsert`): hai transaction cùng upsert khoá MỚI → P2002 không được `withTransaction` retry. */
  async upsert(input: ReservationInput, tx?: TxHandle): Promise<SlugReservation> {
    const db = dbOf(tx);
    const data = { portfolioId: input.portfolioId, redirectTo: input.redirectTo, expiresAt: input.expiresAt };
    const res = await db.portfolioSlugReservation.updateMany({ where: { slugKey: input.slugKey }, data });
    if (res.count === 0) {
      const created = await mapUnique(`PortfolioSlugReservation:${input.slugKey}`, () => db.portfolioSlugReservation.create({ data: { slugKey: input.slugKey, ...data } }));
      return toReservation(created);
    }
    const r = await db.portfolioSlugReservation.findUniqueOrThrow({ where: { slugKey: input.slugKey } });
    return toReservation(r);
  }

  async redirectAll(portfolioId: string, redirectTo: string | null, tx?: TxHandle): Promise<number> {
    const res = await dbOf(tx).portfolioSlugReservation.updateMany({ where: { portfolioId, redirectTo: { not: null } }, data: { redirectTo } });
    return res.count;
  }

  async deleteByKey(slugKey: string, tx?: TxHandle): Promise<boolean> {
    return (await dbOf(tx).portfolioSlugReservation.deleteMany({ where: { slugKey } })).count === 1;
  }

  async deleteExpired(now: Date, limit: number): Promise<string[]> {
    const rows = await prisma.portfolioSlugReservation.findMany({ where: { expiresAt: { lt: now } }, select: { id: true, slugKey: true }, take: limit });
    if (rows.length === 0) return [];
    await prisma.portfolioSlugReservation.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return rows.map((r) => r.slugKey);
  }
}
