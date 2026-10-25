import { prisma } from "../../../infrastructure/database";
import type { XpRule, XpSourceTypeValue } from "../entities/gamification.interface";
import type { IXpRuleRepository, XpRuleWrite } from "./xp-rule.repository.interface";

type XpRuleRecord = Awaited<ReturnType<typeof prisma.xpRule.findFirstOrThrow>>;

function toXpRule(r: XpRuleRecord): XpRule {
  return {
    id: r.id,
    sourceType: r.sourceType as XpSourceTypeValue,
    xp: r.xp,
    dailyCap: r.dailyCap,
    countsForStreak: r.countsForStreak,
    isActive: r.isActive,
    version: r.version,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
  };
}

export class PrismaXpRuleRepository implements IXpRuleRepository {
  async listAll(): Promise<XpRule[]> {
    return (await prisma.xpRule.findMany({ orderBy: { sourceType: "asc" } })).map(toXpRule);
  }

  async find(sourceType: XpSourceTypeValue): Promise<XpRule | null> {
    const r = await prisma.xpRule.findUnique({ where: { sourceType } });
    return r ? toXpRule(r) : null;
  }

  async updateIf(sourceType: XpSourceTypeValue, expectedVersion: number, patch: XpRuleWrite, actorId: string): Promise<XpRule | null> {
    const res = await prisma.xpRule.updateMany({
      where: { sourceType, version: expectedVersion },
      data: { xp: patch.xp, dailyCap: patch.dailyCap, countsForStreak: patch.countsForStreak, isActive: patch.isActive, updatedBy: actorId, version: { increment: 1 } },
    });
    return res.count > 0 ? this.find(sourceType) : null;
  }

  async createMissing(rows: ReadonlyArray<XpRuleWrite & { sourceType: XpSourceTypeValue }>): Promise<number> {
    const have = new Set((await prisma.xpRule.findMany({ select: { sourceType: true } })).map((r) => r.sourceType as string));
    const missing = rows.filter((r) => !have.has(r.sourceType));
    if (missing.length === 0) return 0;
    // `dailyCap`/`updatedBy` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
    const res = await prisma.xpRule.createMany({ data: missing.map((r) => ({ ...r, updatedBy: null })) });
    return res.count;
  }
}
