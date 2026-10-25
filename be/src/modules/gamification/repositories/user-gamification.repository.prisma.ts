import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { Criteria, CriteriaClause } from "../../../shared/criteria/criteria-evaluator";
import { emptyCounters, type GamificationCounters, type UserGamification, type UserGamificationPatch } from "../entities/gamification.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";
import type { IUserGamificationRepository } from "./user-gamification.repository.interface";

type UserGamificationRecord = Awaited<ReturnType<typeof prisma.userGamification.findFirstOrThrow>>;

export function toUserGamification(r: UserGamificationRecord): UserGamification {
  const c = r.counters;
  const counters: GamificationCounters = {
    tasksDone: c.tasksDone,
    tasksOnTime: c.tasksOnTime,
    quizzesTaken: c.quizzesTaken,
    quizzesPassed: c.quizzesPassed,
    quizHighScores: c.quizHighScores,
    srReviews: c.srReviews,
    srReviewDays: c.srReviewDays,
    reviewsGiven: c.reviewsGiven,
    setsPublished: c.setsPublished,
    longestStreak: c.longestStreak,
  };
  return {
    id: r.id,
    userId: r.userId,
    xp: r.xp,
    level: r.level,
    streak: r.streak,
    lastActiveDate: r.lastActiveDate,
    streakTz: r.streakTz,
    counters,
    showcaseBadgeIds: r.showcaseBadgeIds,
    levelUpSeenLevel: r.levelUpSeenLevel,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** `level` là counter TÍNH TỪ cấp độ (cột cấp cao nhất); các counter còn lại nằm trong composite `counters`. */
const clauseWhere = (c: CriteriaClause): Prisma.UserGamificationWhereInput =>
  c.counter === "level" ? { level: { gte: c.value } } : { counters: { is: { [c.counter]: { gte: c.value } } } };

/** `all` (AND) ∧ (`any` không rỗng → OR). */
export function criteriaWhere(criteria: Criteria): Prisma.UserGamificationWhereInput {
  const any = criteria.any ?? [];
  return { AND: [...criteria.all.map(clauseWhere), ...(any.length > 0 ? [{ OR: any.map(clauseWhere) }] : [])] };
}

export class PrismaUserGamificationRepository implements IUserGamificationRepository {
  async find(userId: string, tx?: TxHandle): Promise<UserGamification | null> {
    const r = await (tx ?? prisma).userGamification.findUnique({ where: { userId } });
    return r ? toUserGamification(r) : null;
  }

  async findMany(userIds: readonly string[]): Promise<UserGamification[]> {
    if (userIds.length === 0) return [];
    return (await prisma.userGamification.findMany({ where: { userId: { in: [...userIds] } } })).map(toUserGamification);
  }

  async ensure(userId: string): Promise<void> {
    if (await prisma.userGamification.findUnique({ where: { userId }, select: { id: true } })) return;
    try {
      // `lastActiveDate`/`streakTz` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      await prisma.userGamification.create({
        data: { userId, xp: 0, level: 1, streak: 0, lastActiveDate: null, streakTz: null, counters: emptyCounters(), showcaseBadgeIds: [], levelUpSeenLevel: 1 },
      });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async updateIf(userId: string, expectedVersion: number, patch: UserGamificationPatch, tx?: TxHandle): Promise<UserGamification | null> {
    const db = tx ?? prisma;
    const { counters, showcaseBadgeIds, ...scalars } = patch;
    const res = await db.userGamification.updateMany({
      where: { userId, version: expectedVersion },
      data: {
        ...scalars,
        ...(counters && { counters: { set: counters } }),
        ...(showcaseBadgeIds && { showcaseBadgeIds: { set: showcaseBadgeIds } }),
        version: { increment: 1 },
      },
    });
    return res.count > 0 ? this.find(userId, tx) : null;
  }

  countMatching(criteria: Criteria): Promise<number> {
    return prisma.userGamification.count({ where: criteriaWhere(criteria) });
  }

  async listMatchingPage(criteria: Criteria, opts: { afterUserId?: string; limit: number }): Promise<UserGamification[]> {
    const rows = await prisma.userGamification.findMany({
      where: { AND: [criteriaWhere(criteria), ...(opts.afterUserId ? [{ userId: { gt: opts.afterUserId } }] : [])] },
      orderBy: { userId: "asc" },
      take: opts.limit,
    });
    return rows.map(toUserGamification);
  }

  async listStreakTimezones(): Promise<string[]> {
    const rows = await prisma.userGamification.findMany({ where: { streak: { gt: 0 }, streakTz: { not: null } }, distinct: ["streakTz"], select: { streakTz: true } });
    return rows.flatMap((r) => (r.streakTz ? [r.streakTz] : []));
  }

  async resetStaleStreaks(tz: string, beforeDate: string): Promise<string[]> {
    const where: Prisma.UserGamificationWhereInput = { streakTz: tz, streak: { gt: 0 }, lastActiveDate: { not: null, lt: beforeDate } };
    const ids = (await prisma.userGamification.findMany({ where, select: { userId: true } })).map((r) => r.userId);
    if (ids.length === 0) return [];
    await prisma.userGamification.updateMany({ where: { ...where, userId: { in: ids } }, data: { streak: 0, version: { increment: 1 } } });
    return ids;
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userGamification.deleteMany({ where: { userId } })).count;
  }
}
