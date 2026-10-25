import { prisma } from "../../../infrastructure/database";
import type { UserBadge } from "../entities/gamification.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";
import type { IUserBadgeRepository } from "./user-badge.repository.interface";

type UserBadgeRecord = Awaited<ReturnType<typeof prisma.userBadge.findFirstOrThrow>>;

const toUserBadge = (r: UserBadgeRecord): UserBadge => ({
  id: r.id,
  userId: r.userId,
  badgeId: r.badgeId,
  unlockedAt: r.unlockedAt,
  seenAt: r.seenAt,
  via: r.via,
  revokedAt: r.revokedAt,
  revokedBy: r.revokedBy,
  revokeReason: r.revokeReason,
});

/** Trường về sau lọc bằng `null` (`seenAt`, `revokedAt`) ghi `null` TƯỜNG MINH lúc tạo — Mongo: vắng mặt ≠ null. */
const createData = (row: { userId: string; badgeId: string; via: string }) => ({
  userId: row.userId,
  badgeId: row.badgeId,
  via: row.via,
  seenAt: null,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
});

export class PrismaUserBadgeRepository implements IUserBadgeRepository {
  async listByUser(userId: string, tx?: TxHandle): Promise<UserBadge[]> {
    return (await (tx ?? prisma).userBadge.findMany({ where: { userId }, orderBy: { unlockedAt: "asc" } })).map(toUserBadge);
  }

  async create(row: { userId: string; badgeId: string; via: "EVENT" | "BACKFILL" }, tx?: TxHandle): Promise<UserBadge> {
    try {
      return toUserBadge(await (tx ?? prisma).userBadge.create({ data: createData(row) }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("UserBadge.userId_badgeId");
      throw err;
    }
  }

  async insertIfMissing(row: { userId: string; badgeId: string; via: "EVENT" | "BACKFILL" }): Promise<boolean> {
    if (await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId: row.userId, badgeId: row.badgeId } }, select: { id: true } })) return false;
    try {
      await prisma.userBadge.create({ data: createData(row) });
      return true;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return false;
      throw err;
    }
  }

  async countByBadges(badgeIds: readonly string[]): Promise<Map<string, number>> {
    if (badgeIds.length === 0) return new Map();
    const groups = await prisma.userBadge.groupBy({ by: ["badgeId"], where: { badgeId: { in: [...badgeIds] }, revokedAt: null }, _count: { _all: true }, orderBy: { badgeId: "asc" } });
    return new Map(groups.map((g) => [g.badgeId, g._count._all]));
  }

  async markSeen(userId: string, badgeIds: readonly string[], at: Date): Promise<void> {
    if (badgeIds.length === 0) return;
    await prisma.userBadge.updateMany({ where: { userId, badgeId: { in: [...badgeIds] }, seenAt: null }, data: { seenAt: at } });
  }

  async revoke(userId: string, badgeId: string, actorId: string, reason: string, at: Date): Promise<boolean> {
    const res = await prisma.userBadge.updateMany({ where: { userId, badgeId, revokedAt: null }, data: { revokedAt: at, revokedBy: actorId, revokeReason: reason } });
    return res.count > 0;
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userBadge.deleteMany({ where: { userId } })).count;
  }
}
