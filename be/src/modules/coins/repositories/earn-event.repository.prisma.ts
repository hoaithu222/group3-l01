import { prisma } from "../../../infrastructure/database";
import type { CoinEarnEvent, CoinEarnEventInsert } from "../entities/coins.interface";
import type { ICoinEarnEventRepository } from "./earn-event.repository.interface";
import { isPrismaUniqueViolation, UniqueViolationError, type TxHandle } from "./tx";

type EarnRecord = Awaited<ReturnType<typeof prisma.coinEarnEvent.findFirstOrThrow>>;

const toEarnEvent = (r: EarnRecord): CoinEarnEvent => ({
  id: r.id,
  dedupeKey: r.dedupeKey,
  userId: r.userId,
  sourceType: r.sourceType,
  sourceId: r.sourceId,
  localDate: r.localDate,
  coins: r.coins,
  capped: r.capped,
  at: r.at,
});

export class PrismaCoinEarnEventRepository implements ICoinEarnEventRepository {
  async exists(dedupeKey: string): Promise<boolean> {
    return (await prisma.coinEarnEvent.count({ where: { dedupeKey } })) > 0;
  }

  async create(input: CoinEarnEventInsert, tx: TxHandle): Promise<CoinEarnEvent> {
    try {
      return toEarnEvent(await tx.coinEarnEvent.create({ data: input }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("CoinEarnEvent.dedupeKey");
      throw err;
    }
  }

  async sumCoins(userId: string, localDate: string, sourceType: string | null, tx?: TxHandle): Promise<number> {
    const agg = await (tx ?? prisma).coinEarnEvent.aggregate({ where: { userId, localDate, ...(sourceType !== null && { sourceType }) }, _sum: { coins: true } });
    return agg._sum.coins ?? 0;
  }

  async sumBySourceSince(fromLocalDate: string): Promise<Map<string, number>> {
    const rows = await prisma.coinEarnEvent.groupBy({ by: ["sourceType"], where: { localDate: { gte: fromLocalDate } }, _sum: { coins: true } });
    return new Map(rows.map((r) => [r.sourceType, r._sum.coins ?? 0]));
  }
}
