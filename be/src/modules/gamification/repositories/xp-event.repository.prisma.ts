import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { XpEvent, XpEventCreateInput, XpSourceTypeValue } from "../entities/gamification.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";
import type { IXpEventRepository, XpRankRow } from "./xp-event.repository.interface";

type XpEventRecord = Awaited<ReturnType<typeof prisma.xpEvent.findFirstOrThrow>>;

export function toXpEvent(r: XpEventRecord): XpEvent {
  return {
    id: r.id,
    dedupeKey: r.dedupeKey,
    userId: r.userId,
    sourceType: r.sourceType as XpSourceTypeValue,
    sourceId: r.sourceId,
    workspaceId: r.workspaceId,
    xp: r.xp,
    capped: r.capped,
    blockedReason: r.blockedReason,
    localDate: r.localDate,
    occurredAt: r.occurredAt,
    actorId: r.actorId,
    reason: r.reason,
    createdAt: r.createdAt,
  };
}

interface RawGroup {
  _id: { $oid: string };
  xp: number;
}

export class PrismaXpEventRepository implements IXpEventRepository {
  async exists(dedupeKey: string): Promise<boolean> {
    return (await prisma.xpEvent.count({ where: { dedupeKey } })) > 0;
  }

  async create(input: XpEventCreateInput, tx: TxHandle): Promise<XpEvent> {
    try {
      // Trường tuỳ chọn ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      return toXpEvent(await tx.xpEvent.create({ data: input }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("XpEvent.dedupeKey");
      throw err;
    }
  }

  async listByUser(userId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<XpEvent[]> {
    const after = opts.after;
    const where: Prisma.XpEventWhereInput = {
      userId,
      ...(after && { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }),
    };
    return (await prisma.xpEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: opts.limit })).map(toXpEvent);
  }

  async getDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string, tx: TxHandle): Promise<number> {
    const row = await tx.xpDailyTotal.findUnique({ where: { userId_sourceType_localDate: { userId, sourceType, localDate } } });
    return row?.xp ?? 0;
  }

  async ensureDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string): Promise<void> {
    const where = { userId_sourceType_localDate: { userId, sourceType, localDate } };
    if (await prisma.xpDailyTotal.findUnique({ where, select: { id: true } })) return;
    try {
      await prisma.xpDailyTotal.create({ data: { userId, sourceType, localDate, xp: 0 } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async incDailyTotal(userId: string, sourceType: XpSourceTypeValue, localDate: string, by: number, tx: TxHandle): Promise<void> {
    await tx.xpDailyTotal.updateMany({ where: { userId, sourceType, localDate }, data: { xp: { increment: by } } });
  }

  async deleteDailyTotalsByUser(userId: string): Promise<number> {
    return (await prisma.xpDailyTotal.deleteMany({ where: { userId } })).count;
  }

  async rankByWorkspace(workspaceId: string, from: Date | null, to: Date | null, limit: number): Promise<XpRankRow[]> {
    const range: Record<string, unknown> = {};
    if (from) range.$gte = { $date: from.toISOString() };
    if (to) range.$lt = { $date: to.toISOString() };
    const match: Record<string, unknown> = { workspaceId: { $oid: workspaceId }, xp: { $gt: 0 }, ...(from || to ? { occurredAt: range } : {}) };
    const rows = (await prisma.xpEvent.aggregateRaw({
      pipeline: [{ $match: match }, { $group: { _id: "$userId", xp: { $sum: "$xp" } } }, { $sort: { xp: -1, _id: 1 } }, { $limit: limit }] as unknown as Prisma.InputJsonValue[],
    })) as unknown as RawGroup[];
    return rows.map((r) => ({ userId: r._id.$oid, xp: r.xp }));
  }
}
