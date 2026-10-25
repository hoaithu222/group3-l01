import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { SrDueQuery, SrProgress, SrProgressCreateInput, SrProgressPatch, SrSourceValue, SrSuspendReason } from "../entities/sr.interface";
import type { SrRatingValue, SrStatusValue } from "../services/sm2";
import { isPrismaUniqueViolation } from "./errors";
import type { ISrProgressRepository } from "./sr-progress.repository.interface";
import type { TxHandle } from "./tx";

type SrProgressRecord = Awaited<ReturnType<typeof prisma.srProgress.findFirstOrThrow>>;

export function toSrProgress(r: SrProgressRecord): SrProgress {
  return {
    id: r.id,
    userId: r.userId,
    itemId: r.itemId,
    setId: r.setId,
    status: r.status as SrStatusValue,
    source: r.source as SrSourceValue,
    easiness: r.easiness,
    interval: r.interval,
    repetition: r.repetition,
    lapses: r.lapses,
    nextReviewAt: r.nextReviewAt,
    lastRating: (r.lastRating as SrRatingValue | null) ?? null,
    lastReviewedAt: r.lastReviewedAt,
    itemOrder: r.itemOrder,
    suspendedReason: r.suspendedReason,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const DUE_STATUSES: SrStatusValue[] = ["LEARNING", "REVIEW"];
const REOPENABLE = ["LOST_ACCESS", "SET_HIDDEN"];
const inSets = (setIds?: readonly string[]): Prisma.SrProgressWhereInput => (setIds ? { setId: { in: [...setIds] } } : {});
const MAX_CREATE_ATTEMPTS = 3;

export class PrismaSrProgressRepository implements ISrProgressRepository {
  async findByUserItem(userId: string, itemId: string, tx?: TxHandle): Promise<SrProgress | null> {
    const r = await (tx ?? prisma).srProgress.findUnique({ where: { userId_itemId: { userId, itemId } } });
    return r ? toSrProgress(r) : null;
  }

  async findByUserItems(userId: string, itemIds: readonly string[]): Promise<SrProgress[]> {
    if (itemIds.length === 0) return [];
    return (await prisma.srProgress.findMany({ where: { userId, itemId: { in: [...itemIds] } } })).map(toSrProgress);
  }

  async createMissing(rows: readonly SrProgressCreateInput[]): Promise<number> {
    let pending = [...rows];
    let created = 0;
    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS && pending.length > 0; attempt += 1) {
      const existing = new Set(
        (await prisma.srProgress.findMany({ where: { userId: pending[0].userId, itemId: { in: pending.map((p) => p.itemId) } }, select: { itemId: true } })).map((e) => e.itemId)
      );
      pending = pending.filter((p) => !existing.has(p.itemId));
      if (pending.length === 0) break;
      try {
        const res = await prisma.srProgress.createMany({ data: pending.map((p) => this.createData(p)) });
        created += res.count;
        pending = [];
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
        // Đua với một lượt tạo khác: createMany không nguyên tử — đếm lại phần đã có rồi thử phần còn thiếu.
      }
    }
    return created;
  }

  private createData(p: SrProgressCreateInput): Prisma.SrProgressCreateManyInput {
    return {
      userId: p.userId,
      itemId: p.itemId,
      setId: p.setId,
      status: p.status,
      source: p.source,
      easiness: p.easiness,
      interval: p.interval,
      repetition: p.repetition,
      lapses: p.lapses,
      nextReviewAt: p.nextReviewAt,
      itemOrder: p.itemOrder,
      // Quy ước Mongo: trường về sau lọc bằng null phải ghi `null` TƯỜNG MINH lúc tạo.
      lastRating: p.lastRating,
      lastReviewedAt: p.lastReviewedAt,
      suspendedReason: null,
    };
  }

  async updateIf(id: string, expectedVersion: number, patch: SrProgressPatch, tx?: TxHandle): Promise<SrProgress | null> {
    const db = tx ?? prisma;
    const data: Prisma.SrProgressUpdateManyMutationInput = { version: { increment: 1 } };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (data as Record<string, unknown>)[k] = v;
    const res = await db.srProgress.updateMany({ where: { id, version: expectedVersion }, data });
    if (res.count === 0) return null;
    const r = await db.srProgress.findUnique({ where: { id } });
    return r ? toSrProgress(r) : null;
  }

  async listDue(userId: string, q: SrDueQuery): Promise<SrProgress[]> {
    const rows = await prisma.srProgress.findMany({
      where: { userId, status: { in: DUE_STATUSES }, nextReviewAt: { lt: q.before }, ...inSets(q.setIds) },
      orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
      take: q.limit,
    });
    return rows.map(toSrProgress);
  }

  countDue(userId: string, before: Date, setIds?: readonly string[]): Promise<number> {
    return prisma.srProgress.count({ where: { userId, status: { in: DUE_STATUSES }, nextReviewAt: { lt: before }, ...inSets(setIds) } });
  }

  async listNew(userId: string, setId: string, limit: number): Promise<SrProgress[]> {
    if (limit <= 0) return [];
    const rows = await prisma.srProgress.findMany({ where: { userId, setId, status: "NEW" }, orderBy: [{ itemOrder: "asc" }, { id: "asc" }], take: limit });
    return rows.map(toSrProgress);
  }

  countNew(userId: string, setId: string): Promise<number> {
    return prisma.srProgress.count({ where: { userId, setId, status: "NEW" } });
  }

  async listSetIds(userId: string): Promise<string[]> {
    return (await prisma.srProgress.findMany({ where: { userId }, distinct: ["setId"], select: { setId: true } })).map((r) => r.setId);
  }

  async listSuspendedSetIds(userId: string): Promise<string[]> {
    return (await prisma.srProgress.findMany({ where: { userId, status: "SUSPENDED" }, distinct: ["setId"], select: { setId: true } })).map((r) => r.setId);
  }

  async suspendBySets(userId: string, setIds: readonly string[], reason: SrSuspendReason): Promise<number> {
    if (setIds.length === 0) return 0;
    const res = await prisma.srProgress.updateMany({
      where: { userId, setId: { in: [...setIds] }, status: { not: "SUSPENDED" } },
      data: { status: "SUSPENDED", suspendedReason: reason, version: { increment: 1 } },
    });
    return res.count;
  }

  async reopenBySet(userId: string, setId: string): Promise<number> {
    const base = { userId, setId, status: "SUSPENDED" as const, suspendedReason: { in: REOPENABLE } };
    const bump = { suspendedReason: null, version: { increment: 1 } };
    const neu = await prisma.srProgress.updateMany({ where: { ...base, interval: 0 }, data: { ...bump, status: "NEW" } });
    const learning = await prisma.srProgress.updateMany({ where: { ...base, interval: { gt: 0 }, repetition: 0 }, data: { ...bump, status: "LEARNING" } });
    const review = await prisma.srProgress.updateMany({ where: { ...base, interval: { gt: 0 }, repetition: { gt: 0 } }, data: { ...bump, status: "REVIEW" } });
    return neu.count + learning.count + review.count;
  }

  async listDueDates(userId: string, from: Date, to: Date, setIds?: readonly string[]): Promise<Date[]> {
    const rows = await prisma.srProgress.findMany({
      where: { userId, status: { in: DUE_STATUSES }, nextReviewAt: { gte: from, lt: to }, ...inSets(setIds) },
      select: { nextReviewAt: true },
    });
    return rows.map((r) => r.nextReviewAt);
  }

  async deleteByItems(itemIds: readonly string[]): Promise<number> {
    if (itemIds.length === 0) return 0;
    return (await prisma.srProgress.deleteMany({ where: { itemId: { in: [...itemIds] } } })).count;
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.srProgress.deleteMany({ where: { userId } })).count;
  }

  async listCandidateUserIds(before: Date, opts: { afterUserId?: string; limit: number }): Promise<string[]> {
    const groups = await prisma.srProgress.groupBy({
      by: ["userId"],
      where: { status: { in: ["NEW", ...DUE_STATUSES] }, nextReviewAt: { lt: before }, ...(opts.afterUserId && { userId: { gt: opts.afterUserId } }) },
      orderBy: { userId: "asc" },
      take: opts.limit,
    });
    return groups.map((g) => g.userId);
  }
}
