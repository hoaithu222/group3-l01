import { createWorkspaceMembershipPort } from "../members/public";
import { PrismaBurnoutAggregateRepository } from "./repositories/aggregate.repository.prisma";
import { PrismaBurnoutAssessmentRepository } from "./repositories/assessment.repository.prisma";
import { PrismaWellbeingDailyRepository } from "./repositories/daily.repository.prisma";
import { PrismaBurnoutDirectory } from "./repositories/directory";
import { PrismaWellbeingSettingRepository } from "./repositories/setting.repository.prisma";
import { PrismaWellbeingShareRepository } from "./repositories/share.repository.prisma";
import { NodeBurnoutSignalStore } from "./repositories/signal-store";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { BurnoutAdminService } from "./services/burnout-admin.service";
import { BurnoutAggregatorService } from "./services/burnout-aggregator.service";
import { BurnoutAssessorService } from "./services/burnout-assessor.service";
import { BurnoutCollectorService } from "./services/burnout-collector.service";
import { BurnoutEvaluationService } from "./services/burnout-evaluation.service";
import { BurnoutHistoryService } from "./services/burnout-history.service";
import { BurnoutPrivacyService } from "./services/burnout-privacy.service";
import { BurnoutSettingService } from "./services/burnout-setting.service";
import { NotifyBurnoutNotifier, RuntimeBurnoutConfig, RuntimeBurnoutRuleSource, ServiceBurnoutAudit, SocketBurnoutEmitter, SystemConfigRulesAdminPort } from "./services/burnout.ports";
import { WellbeingShareService } from "./services/wellbeing-share.service";

/**
 * Nối dây DI cho module `burnout` — dùng CHUNG bởi `burnout.routes.ts`, `admin-burnout.routes.ts`, job và collector (tiến trình worker riêng không import routes nên dùng `getBurnoutContainer()`).
 * Không có DI container trong codebase (mẫu `coins.container.ts`).
 */
export function createBurnoutContainer() {
  const settings = new PrismaWellbeingSettingRepository();
  const dailies = new PrismaWellbeingDailyRepository();
  const assessments = new PrismaBurnoutAssessmentRepository();
  const aggregate = new PrismaBurnoutAggregateRepository();
  const directory = new PrismaBurnoutDirectory();
  const shares = new PrismaWellbeingShareRepository();
  const store = new NodeBurnoutSignalStore();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const config = new RuntimeBurnoutConfig();
  const rules = new RuntimeBurnoutRuleSource();
  const membership = createWorkspaceMembershipPort();

  const aggregator = new BurnoutAggregatorService({ store, dailies });
  const assessor = new BurnoutAssessorService({ settings, dailies, assessments, notifier: new NotifyBurnoutNotifier(), emitter: new SocketBurnoutEmitter(), tx });

  return {
    settings: new BurnoutSettingService({ settings, dailies, assessments, store, directory, tx, outbox }),
    history: new BurnoutHistoryService({ settings, dailies, assessments, directory, tx }),
    collector: new BurnoutCollectorService({ store, directory, config }),
    evaluation: new BurnoutEvaluationService({ settings, directory, store, aggregator, assessor, config, rules }),
    privacy: new BurnoutPrivacyService({ settings, dailies, assessments, shares, store, tx }),
    admin: new BurnoutAdminService({ aggregate, rules: new SystemConfigRulesAdminPort(), audit: new ServiceBurnoutAudit() }),
    /** P1 — chia sẻ mức rủi ro với trưởng nhóm + `GET /workspaces/:id/wellbeing/indicators` (be.md §4/§5). */
    share: new WellbeingShareService({ shares, settings, assessments, directory, membership }),
  };
}

export type BurnoutContainer = ReturnType<typeof createBurnoutContainer>;

let cached: BurnoutContainer | null = null;

/** Singleton lười cho job/route/collector (tránh dựng lại repo/service mỗi lần). */
export function getBurnoutContainer(): BurnoutContainer {
  cached ??= createBurnoutContainer();
  return cached;
}
