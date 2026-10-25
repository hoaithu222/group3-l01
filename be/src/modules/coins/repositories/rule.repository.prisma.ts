import { prisma } from "../../../infrastructure/database";
import type { CoinRule, CoinRuleWrite, CoinSourceTypeValue } from "../entities/coins.interface";
import type { ICoinRuleRepository } from "./rule.repository.interface";
import { isPrismaUniqueViolation } from "./tx";

type RuleRecord = Awaited<ReturnType<typeof prisma.coinRule.findFirstOrThrow>>;

const toRule = (r: RuleRecord): CoinRule => ({
  id: r.id,
  sourceType: r.sourceType as CoinSourceTypeValue,
  coins: r.coins,
  dailyCap: r.dailyCap,
  isActive: r.isActive,
  version: r.version,
  updatedBy: r.updatedBy,
  updatedAt: r.updatedAt,
});

export class PrismaCoinRuleRepository implements ICoinRuleRepository {
  async listAll(): Promise<CoinRule[]> {
    return (await prisma.coinRule.findMany({ orderBy: { sourceType: "asc" } })).map(toRule);
  }

  async find(sourceType: CoinSourceTypeValue): Promise<CoinRule | null> {
    const r = await prisma.coinRule.findUnique({ where: { sourceType } });
    return r ? toRule(r) : null;
  }

  async create(sourceType: CoinSourceTypeValue, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null> {
    try {
      // `dailyCap` ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      return toRule(await prisma.coinRule.create({ data: { sourceType, coins: data.coins, dailyCap: data.dailyCap, isActive: data.isActive, updatedBy: actorId } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return null;
      throw err;
    }
  }

  async updateIf(sourceType: CoinSourceTypeValue, expectedVersion: number, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null> {
    const res = await prisma.coinRule.updateMany({
      where: { sourceType, version: expectedVersion },
      data: { coins: data.coins, dailyCap: data.dailyCap, isActive: data.isActive, updatedBy: actorId, version: { increment: 1 } },
    });
    return res.count > 0 ? this.find(sourceType) : null;
  }
}
