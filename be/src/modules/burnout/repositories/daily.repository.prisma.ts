import { prisma } from "../../../infrastructure/database";
import type { WellbeingDailyEntity, WellbeingDailyInput } from "../entities/burnout.interface";
import type { IWellbeingDailyRepository } from "./daily.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type DailyRecord = Awaited<ReturnType<typeof prisma.wellbeingDaily.findFirstOrThrow>>;

const toEntity = (r: DailyRecord): WellbeingDailyEntity => ({
  id: r.id,
  userId: r.userId,
  date: r.date,
  timezone: r.timezone,
  activeMinutes: r.activeMinutes,
  longestContinuousMinutes: r.longestContinuousMinutes,
  lateNightMinutes: r.lateNightMinutes,
  eventsCount: r.eventsCount,
  lateNightEvents: r.lateNightEvents,
  createdAt: r.createdAt,
});

export class PrismaWellbeingDailyRepository implements IWellbeingDailyRepository {
  async findByDate(userId: string, date: string): Promise<WellbeingDailyEntity | null> {
    const r = await prisma.wellbeingDaily.findUnique({ where: { userId_date: { userId, date } } });
    return r ? toEntity(r) : null;
  }

  async upsert(input: WellbeingDailyInput): Promise<WellbeingDailyEntity> {
    const { userId, date, ...fields } = input;
    try {
      return toEntity(await prisma.wellbeingDaily.upsert({ where: { userId_date: { userId, date } }, create: input, update: fields }));
    } catch (err) {
      // Hai lượt tổng hợp đồng thời cùng tạo hàng: bên thua chỉ cần cập nhật (kết quả như nhau vì cùng đầu vào).
      if (!isPrismaUniqueViolation(err)) throw err;
      return toEntity(await prisma.wellbeingDaily.update({ where: { userId_date: { userId, date } }, data: fields }));
    }
  }

  async listSince(userId: string, fromDate: string): Promise<WellbeingDailyEntity[]> {
    const rows = await prisma.wellbeingDaily.findMany({ where: { userId, date: { gte: fromDate } }, orderBy: { date: "asc" } });
    return rows.map(toEntity);
  }

  async deleteByUser(userId: string, tx?: TxHandle): Promise<number> {
    return (await (tx ?? prisma).wellbeingDaily.deleteMany({ where: { userId } })).count;
  }

  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    return (await prisma.wellbeingDaily.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  }
}
