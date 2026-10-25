import { prisma } from "../../../infrastructure/database";
import type { CoinQuest, CoinQuestMetric, CoinQuestWrite, QuestProgress } from "../entities/coins.interface";
import type { CoinQuestPatch, ICoinQuestRepository, IQuestProgressRepository } from "./quest.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type QuestRecord = Awaited<ReturnType<typeof prisma.coinQuest.findFirstOrThrow>>;
type ProgressRecord = Awaited<ReturnType<typeof prisma.userQuestProgress.findFirstOrThrow>>;

const toQuest = (r: QuestRecord): CoinQuest => ({
  id: r.id,
  code: r.code,
  title: r.title,
  description: r.description,
  metric: r.metric as CoinQuestMetric,
  target: r.target,
  coins: r.coins,
  isActive: r.isActive,
  order: r.order,
  version: r.version,
  updatedBy: r.updatedBy,
  updatedAt: r.updatedAt,
});

const toProgress = (r: ProgressRecord): QuestProgress => ({ id: r.id, userId: r.userId, questId: r.questId, date: r.date, progress: r.progress, claimedAt: r.claimedAt });

export class PrismaCoinQuestRepository implements ICoinQuestRepository {
  async listAll(): Promise<CoinQuest[]> {
    return (await prisma.coinQuest.findMany({ orderBy: [{ order: "asc" }, { code: "asc" }] })).map(toQuest);
  }

  async listActive(): Promise<CoinQuest[]> {
    return (await prisma.coinQuest.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { code: "asc" }] })).map(toQuest);
  }

  async find(id: string): Promise<CoinQuest | null> {
    const r = await prisma.coinQuest.findUnique({ where: { id } });
    return r ? toQuest(r) : null;
  }

  async create(data: CoinQuestWrite, actorId: string): Promise<CoinQuest | null> {
    try {
      return toQuest(await prisma.coinQuest.create({ data: { ...data, updatedBy: actorId } }));
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return null;
      throw err;
    }
  }

  async updateIf(id: string, expectedVersion: number, patch: CoinQuestPatch, actorId: string): Promise<CoinQuest | null> {
    const res = await prisma.coinQuest.updateMany({ where: { id, version: expectedVersion }, data: { ...patch, updatedBy: actorId, version: { increment: 1 } } });
    return res.count > 0 ? this.find(id) : null;
  }
}

export class PrismaQuestProgressRepository implements IQuestProgressRepository {
  async ensure(userId: string, questIds: readonly string[], date: string): Promise<void> {
    for (const questId of questIds) {
      const where = { userId_questId_date: { userId, questId, date } };
      if (await prisma.userQuestProgress.findUnique({ where, select: { id: true } })) continue;
      try {
        // `claimedAt` ghi `null` TƯỜNG MINH: điều kiện nhận thưởng `claimedAt: null` không khớp document vắng trường (Mongo: vắng mặt ≠ null).
        await prisma.userQuestProgress.create({ data: { userId, questId, date, progress: 0, claimedAt: null } });
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
      }
    }
  }

  async increment(userId: string, questId: string, date: string, by: number, tx: TxHandle): Promise<void> {
    await tx.userQuestProgress.updateMany({ where: { userId, questId, date }, data: { progress: { increment: by } } });
  }

  async find(userId: string, questId: string, date: string, tx?: TxHandle): Promise<QuestProgress | null> {
    const r = await (tx ?? prisma).userQuestProgress.findUnique({ where: { userId_questId_date: { userId, questId, date } } });
    return r ? toProgress(r) : null;
  }

  async listForDay(userId: string, date: string): Promise<QuestProgress[]> {
    return (await prisma.userQuestProgress.findMany({ where: { userId, date } })).map(toProgress);
  }

  async claimIf(userId: string, questId: string, date: string, target: number, at: Date, tx: TxHandle): Promise<boolean> {
    const res = await tx.userQuestProgress.updateMany({ where: { userId, questId, date, progress: { gte: target }, claimedAt: null }, data: { claimedAt: at } });
    return res.count > 0;
  }
}
