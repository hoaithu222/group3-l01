import type { UserSkillTaskCredit as PrismaCredit } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { UserSkillProgress, UserSkillTaskCredit } from "../entities/skill.interface";
import type { CreditValues, ISkillCreditRepository, NewCredit } from "./skill-ledger.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

const toCredit = (r: PrismaCredit): UserSkillTaskCredit => ({
  id: r.id,
  userId: r.userId,
  skillId: r.skillId,
  taskId: r.taskId,
  workspaceId: r.workspaceId,
  storyPointsX10: r.storyPointsX10,
  reviewScoreX10: r.reviewScoreX10 ?? null,
  completedAt: r.completedAt,
  completionCount: r.completionCount,
  status: r.status,
});

interface AggRow {
  _id: { $oid: string } | string;
  tasksDone: number;
  storyPointsX10: number;
  reviewScoreSumX10: number;
  reviewScoreCount: number;
  lastTaskAt: { $date: string } | string | null;
}

const oidOf = (v: { $oid: string } | string): string => (typeof v === "string" ? v : v.$oid);
const dateOf = (v: { $date: string } | string | null): Date | null => (v === null ? null : new Date(typeof v === "string" ? v : v.$date));

export class PrismaSkillCreditRepository implements ISkillCreditRepository {
  async findByKey(userId: string, skillId: string, taskId: string, tx?: TxHandle): Promise<UserSkillTaskCredit | null> {
    const r = await (tx ?? prisma).userSkillTaskCredit.findUnique({ where: { userId_skillId_taskId: { userId, skillId, taskId } } });
    return r ? toCredit(r) : null;
  }

  async listByTask(taskId: string): Promise<UserSkillTaskCredit[]> {
    return (await prisma.userSkillTaskCredit.findMany({ where: { taskId } })).map(toCredit);
  }

  async findByIds(ids: readonly string[]): Promise<UserSkillTaskCredit[]> {
    if (ids.length === 0) return [];
    return (await prisma.userSkillTaskCredit.findMany({ where: { id: { in: [...ids] } } })).map(toCredit);
  }

  async create(input: NewCredit, tx?: TxHandle): Promise<UserSkillTaskCredit> {
    const key = `UserSkillTaskCredit:${input.userId}:${input.skillId}:${input.taskId}`;
    return toCredit(await mapUnique(key, () => (tx ?? prisma).userSkillTaskCredit.create({ data: { ...input, reviewScoreX10: input.reviewScoreX10 } })));
  }

  async transition(id: string, expect: { status: UserSkillTaskCredit["status"]; completionCount: number }, values: Partial<CreditValues>, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).userSkillTaskCredit.updateMany({ where: { id, status: expect.status, completionCount: expect.completionCount }, data: values });
    return res.count === 1;
  }

  async listTop(userId: string, skillId: string, limit: number): Promise<UserSkillTaskCredit[]> {
    const rows = await prisma.userSkillTaskCredit.findMany({
      where: { userId, skillId, status: "ACTIVE" },
      orderBy: [{ storyPointsX10: "desc" }, { reviewScoreX10: "desc" }, { completedAt: "desc" }],
      take: limit,
    });
    return rows.map(toCredit);
  }

  /** `$group` trên credit ACTIVE của một kỹ năng — nguồn sự thật để đối soát `UserSkillProgress`. */
  async aggregateActive(skillId: string): Promise<Array<Omit<UserSkillProgress, "skillId">>> {
    const raw = (await prisma.userSkillTaskCredit.aggregateRaw({
      pipeline: [
        { $match: { skillId: { $oid: skillId }, status: "ACTIVE" } },
        {
          $group: {
            _id: "$userId",
            tasksDone: { $sum: 1 },
            storyPointsX10: { $sum: "$storyPointsX10" },
            reviewScoreSumX10: { $sum: { $ifNull: ["$reviewScoreX10", 0] } },
            reviewScoreCount: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$reviewScoreX10", null] }, null] }, 0, 1] } },
            lastTaskAt: { $max: "$completedAt" },
          },
        },
      ],
    })) as unknown as AggRow[];
    return raw.map((r) => ({
      userId: oidOf(r._id),
      tasksDone: r.tasksDone,
      storyPointsX10: r.storyPointsX10,
      reviewScoreSumX10: r.reviewScoreSumX10,
      reviewScoreCount: r.reviewScoreCount,
      lastTaskAt: dateOf(r.lastTaskAt),
    }));
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userSkillTaskCredit.deleteMany({ where: { userId } })).count;
  }
}
