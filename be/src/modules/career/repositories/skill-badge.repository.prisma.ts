import type { UserSkillBadge as PrismaBadge } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { UserSkillBadge } from "../entities/skill.interface";
import type { ISkillBadgeRepository, NewSkillBadge } from "./skill-badge.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

export const toSkillBadge = (r: PrismaBadge): UserSkillBadge => ({
  id: r.id,
  userId: r.userId,
  skillId: r.skillId,
  unlockedAt: r.unlockedAt,
  proof: { taskCreditIds: r.proof.taskCreditIds, tasksDone: r.proof.tasksDone, storyPointsX10: r.proof.storyPointsX10, avgPeerScoreX10: r.proof.avgPeerScoreX10 ?? null },
  criteriaSnapshot: {
    requiredTasksDone: r.criteriaSnapshot.requiredTasksDone,
    minStoryPointsX10: r.criteriaSnapshot.minStoryPointsX10 ?? null,
    minAvgPeerScoreX10: r.criteriaSnapshot.minAvgPeerScoreX10 ?? null,
    requireReview: r.criteriaSnapshot.requireReview,
  },
  revokedAt: r.revokedAt ?? null,
  revokedBy: r.revokedBy ?? null,
  revokedReason: r.revokedReason ?? null,
});

export class PrismaSkillBadgeRepository implements ISkillBadgeRepository {
  async find(userId: string, skillId: string, tx?: TxHandle): Promise<UserSkillBadge | null> {
    const r = await (tx ?? prisma).userSkillBadge.findUnique({ where: { userId_skillId: { userId, skillId } } });
    return r ? toSkillBadge(r) : null;
  }

  async listByUser(userId: string, includeRevoked: boolean): Promise<UserSkillBadge[]> {
    const rows = await prisma.userSkillBadge.findMany({ where: { userId, ...(!includeRevoked && { revokedAt: null }) }, orderBy: { unlockedAt: "desc" } });
    return rows.map(toSkillBadge);
  }

  async create(input: NewSkillBadge, tx?: TxHandle): Promise<UserSkillBadge> {
    // `revokedAt: null` TƯỜNG MINH — lọc `{ revokedAt: null }` không khớp field vắng mặt (Prisma-Mongo).
    const r = await mapUnique(`UserSkillBadge:${input.userId}:${input.skillId}`, () =>
      (tx ?? prisma).userSkillBadge.create({ data: { ...input, revokedAt: null, revokedBy: null, revokedReason: null } })
    );
    return toSkillBadge(r);
  }

  async revoke(userId: string, skillId: string, by: string, reason: string, at: Date, tx?: TxHandle): Promise<UserSkillBadge | null> {
    const db = tx ?? prisma;
    const res = await db.userSkillBadge.updateMany({ where: { userId, skillId, revokedAt: null }, data: { revokedAt: at, revokedBy: by, revokedReason: reason } });
    return res.count === 1 ? this.find(userId, skillId, tx) : null;
  }

  async restore(userId: string, skillId: string, tx?: TxHandle): Promise<UserSkillBadge | null> {
    const db = tx ?? prisma;
    const res = await db.userSkillBadge.updateMany({ where: { userId, skillId, revokedAt: { not: null } }, data: { revokedAt: null, revokedBy: null, revokedReason: null } });
    return res.count === 1 ? this.find(userId, skillId, tx) : null;
  }

  async holdersCount(skillIds: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (skillIds.length === 0) return out;
    const rows = await prisma.userSkillBadge.groupBy({ by: ["skillId"], where: { skillId: { in: [...skillIds] }, revokedAt: null }, _count: { _all: true } });
    for (const r of rows) out.set(r.skillId, r._count._all);
    return out;
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userSkillBadge.deleteMany({ where: { userId } })).count;
  }
}
