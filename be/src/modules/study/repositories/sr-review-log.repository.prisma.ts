import { prisma } from "../../../infrastructure/database";
import type { SrReviewLog, SrReviewLogCreateInput } from "../entities/sr.interface";
import type { SrRatingValue } from "../services/sm2";
import { isPrismaUniqueViolation, UniqueViolationError } from "./errors";
import type { ISrReviewLogRepository } from "./sr-review-log.repository.interface";
import type { TxHandle } from "./tx";

type SrReviewLogRecord = Awaited<ReturnType<typeof prisma.srReviewLog.findFirstOrThrow>>;

function toLog(r: SrReviewLogRecord): SrReviewLog {
  return {
    id: r.id,
    userId: r.userId,
    itemId: r.itemId,
    setId: r.setId,
    clientReviewId: r.clientReviewId,
    rating: r.rating as SrRatingValue,
    grade: r.grade,
    prevInterval: r.prevInterval,
    newInterval: r.newInterval,
    localDate: r.localDate,
    reviewedAt: r.reviewedAt,
  };
}

export class PrismaSrReviewLogRepository implements ISrReviewLogRepository {
  async findByClientId(userId: string, clientReviewId: string): Promise<SrReviewLog | null> {
    const r = await prisma.srReviewLog.findUnique({ where: { userId_clientReviewId: { userId, clientReviewId } } });
    return r ? toLog(r) : null;
  }

  async create(row: SrReviewLogCreateInput, tx?: TxHandle): Promise<SrReviewLog> {
    try {
      return toLog(await (tx ?? prisma).srReviewLog.create({ data: row }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("SrReviewLog.clientReviewId");
      throw err;
    }
  }

  countByDate(userId: string, localDate: string, opts: { newOnly?: boolean; setId?: string } = {}): Promise<number> {
    return prisma.srReviewLog.count({
      where: { userId, localDate, ...(opts.newOnly && { prevInterval: 0 }), ...(opts.setId && { setId: opts.setId }) },
    });
  }

  async existsForItemDate(userId: string, itemId: string, localDate: string, tx?: TxHandle): Promise<boolean> {
    return (await (tx ?? prisma).srReviewLog.count({ where: { userId, itemId, localDate } })) > 0;
  }

  async listLocalDates(userId: string, sinceDate: string): Promise<string[]> {
    const rows = await prisma.srReviewLog.findMany({ where: { userId, localDate: { gte: sinceDate } }, distinct: ["localDate"], select: { localDate: true } });
    return rows.map((r) => r.localDate);
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.srReviewLog.deleteMany({ where: { userId } })).count;
  }
}
