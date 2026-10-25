import { prisma } from "../../../infrastructure/database";
import { countLatestLevels } from "../domain/anonymity";
import type { WellbeingLevel } from "../domain/burnout-rules";
import type { IBurnoutAggregateRepository } from "./aggregate.repository.interface";

/** Chỉ đếm/gộp — xem `IBurnoutAggregateRepository`. Truy vấn phân bố mức có đọc `userId` NỘI BỘ để đếm mỗi người một lần nhưng không bao giờ trả ra ngoài. */
export class PrismaBurnoutAggregateRepository implements IBurnoutAggregateRepository {
  countEnabled(): Promise<number> {
    return prisma.wellbeingSetting.count({ where: { optedInAt: { not: null }, optedOutAt: null } });
  }

  countAlertedBetween(from: Date, to: Date): Promise<number> {
    return prisma.burnoutAssessment.count({ where: { alertedAt: { gte: from, lt: to } } });
  }

  async latestLevelCounts(sinceDate: string): Promise<Record<WellbeingLevel, number>> {
    const rows = await prisma.burnoutAssessment.findMany({ where: { date: { gte: sinceDate } }, select: { userId: true, date: true, level: true } });
    return countLatestLevels(rows);
  }
}
