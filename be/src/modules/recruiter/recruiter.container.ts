import { newObjectId } from "../../core/utils/object-id";
import { createSkillBadgeReadPort, createSkillProofReadPort } from "../career/public";
import { ModerationRecruiterReports, PermissionRecruiterAccess, PublicRecruiterAssets, PublicTalentSource, QueueTalentRebuild, RedisSearchCache, RuntimeRecruiterConfig, ServiceRecruiterAudit, SocketRecruiterEmitter } from "./recruiter.adapters";
import { PrismaCareerSettingsRepository } from "./repositories/career-settings.repository";
import { PrismaCompanyBlockRepository } from "./repositories/company-block.repository";
import { PrismaCompanyMemberRepository } from "./repositories/company-member.repository.prisma";
import { PrismaCompanyOfferUsageRepository } from "./repositories/company-offer-usage.repository";
import { PrismaCompanyRepository } from "./repositories/company.repository.prisma";
import { PrismaJobOfferMessageRepository } from "./repositories/job-offer-message.repository";
import { PrismaJobOfferRepository } from "./repositories/job-offer.repository.prisma";
import { PrismaRecruiterDirectory } from "./repositories/recruiter-directory";
import { PrismaTalentProfileViewRepository } from "./repositories/talent-profile-view.repository";
import { PrismaTalentSearchIndexRepository } from "./repositories/talent-search-index.repository";
import { PrismaRecruiterNotifier, PrismaRecruiterOutbox, PrismaTxRunner } from "./repositories/tx";
import { CareerSettingsService } from "./services/career-settings.service";
import { CompanyAdminService } from "./services/company-admin.service";
import { CompanyBlockService } from "./services/company-block.service";
import { CompanyMemberService } from "./services/company-member.service";
import { CompanyService } from "./services/company.service";
import { JobOfferService } from "./services/job-offer.service";
import { OfferMessageService } from "./services/offer-message.service";
import { OfferModerationService } from "./services/offer-moderation.service";
import { RecruiterEventService } from "./services/recruiter-events.service";
import { RecruiterStatsService } from "./services/recruiter-stats.service";
import type { RecruiterDeps } from "./services/recruiter.deps";
import { StudentOfferService } from "./services/student-offer.service";
import { TalentIndexService } from "./services/talent-index.service";
import { TalentSearchService } from "./services/talent-search.service";

export interface RecruiterServices {
  companies: CompanyService;
  members: CompanyMemberService;
  admin: CompanyAdminService;
  offers: JobOfferService;
  studentOffers: StudentOfferService;
  messages: OfferMessageService;
  talentIndex: TalentIndexService;
  talentSearch: TalentSearchService;
  careerSettings: CareerSettingsService;
  blocks: CompanyBlockService;
  stats: RecruiterStatsService;
  events: RecruiterEventService;
  moderation: OfferModerationService;
}

export function buildRecruiterServices(d: RecruiterDeps): RecruiterServices {
  const companies = new CompanyService(d);
  return {
    companies,
    members: new CompanyMemberService(d, companies),
    admin: new CompanyAdminService(d, companies),
    offers: new JobOfferService(d, companies),
    studentOffers: new StudentOfferService(d),
    messages: new OfferMessageService(d),
    talentIndex: new TalentIndexService(d),
    talentSearch: new TalentSearchService(d),
    careerSettings: new CareerSettingsService(d),
    blocks: new CompanyBlockService(d),
    stats: new RecruiterStatsService(d),
    events: new RecruiterEventService(d),
    moderation: new OfferModerationService(d),
  };
}

/** Phụ thuộc mặc định (Prisma/Redis/Socket/cổng công khai của module khác); `overrides` thay từng phần khi dựng đồ thị cho test. */
export function createRecruiterDeps(overrides: Partial<RecruiterDeps> = {}): RecruiterDeps {
  const directory = overrides.directory ?? new PrismaRecruiterDirectory();
  const blocks = overrides.blocks ?? new PrismaCompanyBlockRepository();
  const career = createSkillBadgeReadPort();
  return {
    companies: new PrismaCompanyRepository(),
    members: new PrismaCompanyMemberRepository(),
    usage: new PrismaCompanyOfferUsageRepository(),
    offers: new PrismaJobOfferRepository(),
    messages: new PrismaJobOfferMessageRepository(),
    index: new PrismaTalentSearchIndexRepository(),
    views: new PrismaTalentProfileViewRepository(),
    careerSettings: new PrismaCareerSettingsRepository(),
    tx: new PrismaTxRunner(),
    outbox: new PrismaRecruiterOutbox(),
    notifier: new PrismaRecruiterNotifier(),
    config: new RuntimeRecruiterConfig(),
    searchCache: new RedisSearchCache(),
    access: new PermissionRecruiterAccess(),
    audit: new ServiceRecruiterAudit(),
    assets: new PublicRecruiterAssets(),
    emitter: new SocketRecruiterEmitter(),
    source: new PublicTalentSource(directory, blocks),
    rebuildQueue: new QueueTalentRebuild(),
    reports: new ModerationRecruiterReports(),
    proofs: createSkillProofReadPort(),
    badges: career,
    careerReader: career,
    now: () => new Date(),
    newId: newObjectId,
    ...overrides,
    directory,
    blocks,
  };
}

export interface RecruiterContainer {
  deps: RecruiterDeps;
  services: RecruiterServices;
}

export function createRecruiterContainer(overrides: Partial<RecruiterDeps> = {}): RecruiterContainer {
  const deps = createRecruiterDeps(overrides);
  return { deps, services: buildRecruiterServices(deps) };
}

let instance: RecruiterContainer | null = null;

/** MỘT đồ thị cho API (`recruiter.routes.ts`) lẫn worker (`jobs/recruiter.jobs.ts` — worker không import `router.ts`). */
export function getRecruiterContainer(): RecruiterContainer {
  if (!instance) instance = createRecruiterContainer();
  return instance;
}
