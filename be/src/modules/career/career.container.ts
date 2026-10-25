import { PrismaCareerProfileRepository, type ICareerProfileRepository } from "./repositories/career-profile.repository";
import { PrismaSkillBadgeRepository } from "./repositories/skill-badge.repository.prisma";
import type { ISkillBadgeRepository } from "./repositories/skill-badge.repository.interface";
import { PrismaSkillCreditRepository } from "./repositories/skill-credit.repository.prisma";
import { PrismaSkillDefinitionRepository } from "./repositories/skill-definition.repository.prisma";
import type { ISkillDefinitionRepository } from "./repositories/skill-definition.repository.interface";
import type { ISkillCreditRepository, IUserSkillProgressRepository } from "./repositories/skill-ledger.repository.interface";
import { PrismaSkillProgressRepository } from "./repositories/skill-progress.repository.prisma";
import { PrismaSkillSourceRepository, type ISkillSourceRepository } from "./repositories/skill-source.repository";
import { PrismaCareerNotifier, PrismaCareerOutbox, PrismaTxRunner, type ICareerNotifier, type ICareerOutbox, type ITxRunner } from "./repositories/tx";
import {
  RedisReevaluateGate,
  RuntimeSkillConfig,
  ServiceCareerAudit,
  SocketSkillEmitter,
  type ICareerAudit,
  type IReevaluateGate,
  type ISkillConfigPort,
  type ISkillEmitter,
} from "./services/career.ports";
import { CareerProfileService } from "./services/career-profile.service";
import { CareerUserDataService } from "./services/career-user-data.service";
import { SkillBadgeAdminService } from "./services/skill-badge-admin.service";
import { SkillDefinitionsService } from "./services/skill-definitions.service";
import { SkillEvaluationService } from "./services/skill-evaluation.service";
import { SkillPreviewService } from "./services/skill-preview.service";
import { SkillProgressService } from "./services/skill-progress.service";
import { SkillQueryService } from "./services/skill-query.service";
import { SkillReconcileService } from "./services/skill-reconcile.service";
import { SkillVisibilityService } from "./services/skill-visibility.service";

/** Cổng/kho thay được khi dựng đồ thị cho test (mặc định là bản thật Prisma/Redis/Socket). */
export interface CareerOverrides {
  definitions?: ISkillDefinitionRepository;
  credits?: ISkillCreditRepository;
  progress?: IUserSkillProgressRepository;
  badges?: ISkillBadgeRepository;
  careers?: ICareerProfileRepository;
  source?: ISkillSourceRepository;
  tx?: ITxRunner;
  outbox?: ICareerOutbox;
  notifier?: ICareerNotifier;
  config?: ISkillConfigPort;
  audit?: ICareerAudit;
  emitter?: ISkillEmitter;
  gate?: IReevaluateGate;
  now?: () => Date;
}

export interface CareerContainer {
  definitions: ISkillDefinitionRepository;
  credits: ISkillCreditRepository;
  progress: IUserSkillProgressRepository;
  badges: ISkillBadgeRepository;
  careers: ICareerProfileRepository;
  emitter: ISkillEmitter;
  evaluation: SkillEvaluationService;
  progressService: SkillProgressService;
  visibility: SkillVisibilityService;
  query: SkillQueryService;
  profile: CareerProfileService;
  admin: SkillDefinitionsService;
  preview: SkillPreviewService;
  badgeAdmin: SkillBadgeAdminService;
  reconcile: SkillReconcileService;
  userData: CareerUserDataService;
}

export function createCareerContainer(o: CareerOverrides = {}): CareerContainer {
  const definitions = o.definitions ?? new PrismaSkillDefinitionRepository();
  const credits = o.credits ?? new PrismaSkillCreditRepository();
  const progress = o.progress ?? new PrismaSkillProgressRepository();
  const badges = o.badges ?? new PrismaSkillBadgeRepository();
  const careers = o.careers ?? new PrismaCareerProfileRepository();
  const source = o.source ?? new PrismaSkillSourceRepository();
  const tx = o.tx ?? new PrismaTxRunner();
  const outbox = o.outbox ?? new PrismaCareerOutbox();
  const notifier = o.notifier ?? new PrismaCareerNotifier();
  const config = o.config ?? new RuntimeSkillConfig();
  const audit = o.audit ?? new ServiceCareerAudit();

  const evaluation = new SkillEvaluationService({ progress, credits, badges, tx, notifier, outbox, now: o.now });
  const visibility = new SkillVisibilityService({ careers, source });
  return {
    definitions,
    credits,
    progress,
    badges,
    careers,
    emitter: o.emitter ?? new SocketSkillEmitter(),
    evaluation,
    progressService: new SkillProgressService({ definitions, credits, progress, source, tx, config, evaluation }),
    visibility,
    query: new SkillQueryService({ definitions, progress, credits, badges, visibility }),
    profile: new CareerProfileService(careers, visibility),
    admin: new SkillDefinitionsService({ definitions, badges, tx, outbox, audit }),
    preview: new SkillPreviewService(definitions, progress, source),
    badgeAdmin: new SkillBadgeAdminService({ definitions, progress, badges, source, tx, notifier, outbox, audit, gate: o.gate ?? new RedisReevaluateGate(), now: o.now }),
    reconcile: new SkillReconcileService({ definitions, credits, progress, evaluation, config }),
    userData: new CareerUserDataService({ credits, progress, badges, careers }),
  };
}

let instance: CareerContainer | null = null;

/** MỘT đồ thị cho API (`career.routes.ts`) lẫn worker (`jobs/career.jobs.ts` — worker không import `router.ts`). */
export function getCareerContainer(): CareerContainer {
  if (!instance) instance = createCareerContainer();
  return instance;
}
