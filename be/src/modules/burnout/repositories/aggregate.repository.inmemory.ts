import { countLatestLevels } from "../domain/anonymity";
import type { WellbeingLevel } from "../domain/burnout-rules";
import type { IBurnoutAggregateRepository } from "./aggregate.repository.interface";
import type { InMemoryBurnoutAssessmentRepository } from "./assessment.repository.inmemory";
import type { InMemoryWellbeingSettingRepository } from "./setting.repository.inmemory";
import { isTrackingEnabled } from "../entities/burnout.interface";

/** Bản test: đọc thẳng các repo in-memory nhưng vẫn chỉ trả SỐ ĐẾM (cùng hợp đồng với bản Prisma). */
export class InMemoryBurnoutAggregateRepository implements IBurnoutAggregateRepository {
  constructor(
    private readonly settings: InMemoryWellbeingSettingRepository,
    private readonly assessments: InMemoryBurnoutAssessmentRepository
  ) {}

  countEnabled(): Promise<number> {
    return Promise.resolve([...this.settings.rows.values()].filter(isTrackingEnabled).length);
  }

  countAlertedBetween(from: Date, to: Date): Promise<number> {
    const n = [...this.assessments.rows.values()].filter((a) => a.alertedAt !== null && a.alertedAt.getTime() >= from.getTime() && a.alertedAt.getTime() < to.getTime()).length;
    return Promise.resolve(n);
  }

  latestLevelCounts(sinceDate: string): Promise<Record<WellbeingLevel, number>> {
    return Promise.resolve(countLatestLevels([...this.assessments.rows.values()].filter((a) => a.date >= sinceDate)));
  }
}
