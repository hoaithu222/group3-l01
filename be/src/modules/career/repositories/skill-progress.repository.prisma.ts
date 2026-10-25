import type { Prisma, UserSkillProgress as PrismaProgress } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ProgressDelta, UserSkillProgress } from "../entities/skill.interface";
import type { EligibleQuery, IUserSkillProgressRepository } from "./skill-ledger.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

const toProgress = (r: PrismaProgress): UserSkillProgress => ({
  userId: r.userId,
  skillId: r.skillId,
  tasksDone: r.tasksDone,
  storyPointsX10: r.storyPointsX10,
  reviewScoreSumX10: r.reviewScoreSumX10,
  reviewScoreCount: r.reviewScoreCount,
  lastTaskAt: r.lastTaskAt ?? null,
});

type Doc = Prisma.InputJsonObject;

/**
 * Điều kiện "đủ tiêu chí" dựng thành `$match` trên `UserSkillProgress` (không quét task — CR-27). Điểm review TB đạt khi
 * `round(sum / count) ≥ min` ⇔ `sum / count ≥ min − 0,5` (làm tròn nửa lên như `avgPeerScoreX10`).
 */
function eligibleMatch(q: EligibleQuery): Doc[] {
  const c = q.criteria;
  // Ngưỡng điểm TB 0 luôn đạt (kể cả chưa ai chấm) — như `evaluateSkillCriteria`; > 0 cần ít nhất một task đã chấm (tránh chia 0).
  const needAvg = c.minAvgPeerScoreX10 !== null && c.minAvgPeerScoreX10 > 0;
  const base: Doc = {
    skillId: { $oid: q.skillId },
    tasksDone: { $gte: c.requiredTasksDone },
    ...(c.minStoryPointsX10 !== null && { storyPointsX10: { $gte: c.minStoryPointsX10 } }),
    reviewScoreCount: { $gte: c.requireReview ? c.requiredTasksDone : needAvg ? 1 : 0 },
  };
  if (!needAvg || c.minAvgPeerScoreX10 === null) return [{ $match: base }];
  return [{ $match: base }, { $match: { $expr: { $gte: [{ $divide: ["$reviewScoreSumX10", "$reviewScoreCount"] }, c.minAvgPeerScoreX10 - 0.5] } } }];
}

type OidLike = { $oid: string } | string;
const oidOf = (v: OidLike): string => (typeof v === "string" ? v : v.$oid);

export class PrismaSkillProgressRepository implements IUserSkillProgressRepository {
  async ensure(userId: string, skillId: string): Promise<void> {
    const found = await prisma.userSkillProgress.findUnique({ where: { userId_skillId: { userId, skillId } }, select: { id: true } });
    if (found) return;
    try {
      await prisma.userSkillProgress.create({ data: { userId, skillId, lastTaskAt: null } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async increment(userId: string, skillId: string, d: ProgressDelta, tx?: TxHandle): Promise<void> {
    await (tx ?? prisma).userSkillProgress.update({
      where: { userId_skillId: { userId, skillId } },
      data: {
        tasksDone: { increment: d.tasksDone },
        storyPointsX10: { increment: d.storyPointsX10 },
        reviewScoreSumX10: { increment: d.reviewScoreSumX10 },
        reviewScoreCount: { increment: d.reviewScoreCount },
        ...(d.lastTaskAt && { lastTaskAt: d.lastTaskAt }),
      },
    });
  }

  async find(userId: string, skillId: string): Promise<UserSkillProgress | null> {
    const r = await prisma.userSkillProgress.findUnique({ where: { userId_skillId: { userId, skillId } } });
    return r ? toProgress(r) : null;
  }

  async listByUser(userId: string): Promise<UserSkillProgress[]> {
    return (await prisma.userSkillProgress.findMany({ where: { userId } })).map(toProgress);
  }

  async overwrite(v: UserSkillProgress): Promise<boolean> {
    const cur = await this.find(v.userId, v.skillId);
    const same =
      cur &&
      cur.tasksDone === v.tasksDone &&
      cur.storyPointsX10 === v.storyPointsX10 &&
      cur.reviewScoreSumX10 === v.reviewScoreSumX10 &&
      cur.reviewScoreCount === v.reviewScoreCount;
    if (same) return false;
    if (!cur) await this.ensure(v.userId, v.skillId);
    const { userId, skillId, ...values } = v;
    await prisma.userSkillProgress.update({ where: { userId_skillId: { userId, skillId } }, data: values });
    return true;
  }

  async zeroOthers(skillId: string, keepUserIds: readonly string[]): Promise<number> {
    const res = await prisma.userSkillProgress.updateMany({
      where: { skillId, userId: { notIn: [...keepUserIds] }, OR: [{ tasksDone: { not: 0 } }, { storyPointsX10: { not: 0 } }, { reviewScoreCount: { not: 0 } }] },
      data: { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 },
    });
    return res.count;
  }

  async listEligiblePage(q: EligibleQuery, afterUserId: string | undefined, limit: number): Promise<string[]> {
    const raw = (await prisma.userSkillProgress.aggregateRaw({
      pipeline: [...eligibleMatch(q), ...(afterUserId ? [{ $match: { userId: { $gt: { $oid: afterUserId } } } }] : []), { $sort: { userId: 1 } }, { $limit: limit }, { $project: { userId: 1 } }],
    })) as unknown as Array<{ userId: OidLike }>;
    return raw.map((r) => oidOf(r.userId));
  }

  async previewEligible(q: EligibleQuery, sampleMax: number): Promise<{ eligibleCount: number; alreadyHolding: number; sampleUserIds: string[] }> {
    const holding = {
      $lookup: {
        from: "UserSkillBadge",
        let: { u: "$userId" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$userId", "$$u"] }, { $eq: ["$skillId", { $toObjectId: q.skillId }] }] } } },
          { $limit: 1 },
        ],
        as: "badge",
      },
    };
    const raw = (await prisma.userSkillProgress.aggregateRaw({
      pipeline: [
        ...eligibleMatch(q),
        {
          $facet: {
            total: [{ $count: "n" }],
            holding: [holding, { $match: { "badge.0": { $exists: true } } }, { $count: "n" }],
            sample: [{ $sort: { userId: 1 } }, { $limit: sampleMax }, { $project: { userId: 1 } }],
          },
        },
      ],
    })) as unknown as Array<{ total: Array<{ n: number }>; holding: Array<{ n: number }>; sample: Array<{ userId: OidLike }> }>;
    const r = raw[0];
    return { eligibleCount: r?.total[0]?.n ?? 0, alreadyHolding: r?.holding[0]?.n ?? 0, sampleUserIds: (r?.sample ?? []).map((s) => oidOf(s.userId)) };
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userSkillProgress.deleteMany({ where: { userId } })).count;
  }
}
