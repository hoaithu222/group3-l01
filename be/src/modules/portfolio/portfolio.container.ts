import type { ContributionReadPort } from "../../shared/ports/contribution-read.port";
import type { ReportPort } from "../../shared/ports/report.port";
import { createSkillBadgeReadPort, type SkillBadgeReadPort } from "../career/public";
import { createContributionReadPort } from "../contribution/public";
import { createReportPort } from "../moderation/public";
import { PrismaPortfolioBuildRepository } from "./repositories/portfolio-build.repository.prisma";
import type { IPortfolioBuildRepository } from "./repositories/portfolio-build.repository.interface";
import { PrismaPortfolioProjectRepository } from "./repositories/portfolio-project.repository.prisma";
import type { IPortfolioProjectRepository } from "./repositories/portfolio-project.repository.interface";
import { PrismaPortfolioSlugReservationRepository } from "./repositories/portfolio-slug-reservation.repository.prisma";
import type { IPortfolioSlugReservationRepository } from "./repositories/portfolio-slug-reservation.repository.interface";
import { PrismaPortfolioSourceRepository } from "./repositories/portfolio-source.repository.prisma";
import type { IPortfolioSourceRepository } from "./repositories/portfolio-source.repository.interface";
import { PrismaPortfolioRepository } from "./repositories/portfolio.repository.prisma";
import type { IPortfolioRepository } from "./repositories/portfolio.repository.interface";
import { PrismaPortfolioNotifier, PrismaPortfolioOutbox, PrismaTxRunner, type IPortfolioNotifier, type IPortfolioOutbox, type ITxRunner } from "./repositories/tx";
import { PortfolioBuildScheduler } from "./services/portfolio-build.scheduler";
import { PortfolioBuildService } from "./services/portfolio-build.service";
import { PortfolioEventsService } from "./services/portfolio-events.service";
import { PortfolioImageService } from "./services/portfolio-image.service";
import { PortfolioPageComposer } from "./services/portfolio-page.composer";
import { PortfolioPreviewService } from "./services/portfolio-preview.service";
import { PortfolioProjectService } from "./services/portfolio-project.service";
import { PortfolioPublicService } from "./services/portfolio-public.service";
import { PortfolioPublishService } from "./services/portfolio-publish.service";
import { PortfolioRenderer } from "./services/portfolio-renderer.service";
import { PortfolioSlugService } from "./services/portfolio-slug.service";
import { PortfolioSnapshotService } from "./services/portfolio-snapshot.service";
import { PortfolioService } from "./services/portfolio.service";
import {
  ObjectPortfolioStorage,
  PublicPortfolioAssets,
  RedisPortfolioCache,
  RuntimePortfolioConfig,
  ServicePortfolioAudit,
  SocketPortfolioEmitter,
  portfolioBaseUrl,
  portfolioStoragePrefix,
  type IPortfolioAssets,
  type IPortfolioAudit,
  type IPortfolioCache,
  type IPortfolioConfig,
  type IPortfolioEmitter,
  type IPortfolioStorage,
} from "./services/portfolio.ports";

/** Cổng/kho thay được khi dựng đồ thị cho test (mặc định là bản thật Prisma/Redis/Socket/Storage/cổng module khác). */
export interface PortfolioOverrides {
  portfolios?: IPortfolioRepository;
  projects?: IPortfolioProjectRepository;
  builds?: IPortfolioBuildRepository;
  reservations?: IPortfolioSlugReservationRepository;
  source?: IPortfolioSourceRepository;
  tx?: ITxRunner;
  outbox?: IPortfolioOutbox;
  notifier?: IPortfolioNotifier;
  config?: IPortfolioConfig;
  audit?: IPortfolioAudit;
  emitter?: IPortfolioEmitter;
  storage?: IPortfolioStorage;
  assets?: IPortfolioAssets;
  cache?: IPortfolioCache;
  contribution?: ContributionReadPort;
  career?: Pick<SkillBadgeReadPort, "activeBadges" | "career">;
  reports?: Pick<ReportPort, "closeOpenByTarget">;
  images?: PortfolioImageService;
  htmlMaxBytes?: number;
  snapshotTimeoutMs?: number;
  buildTimeoutMs?: number;
  baseUrl?: () => string;
  storagePrefix?: string;
  now?: () => Date;
}

export interface PortfolioContainer {
  portfolios: IPortfolioRepository;
  projects: IPortfolioProjectRepository;
  builds: IPortfolioBuildRepository;
  reservations: IPortfolioSlugReservationRepository;
  config: IPortfolioConfig;
  cache: IPortfolioCache;
  storage: IPortfolioStorage;
  /** Gốc URL công khai (`PUBLIC_PORTFOLIO_BASE_URL`) — dùng chung cho link chia sẻ, canonical và 301. */
  baseUrl: () => string;
  slugs: PortfolioSlugService;
  snapshots: PortfolioSnapshotService;
  composer: PortfolioPageComposer;
  portfolio: PortfolioService;
  projectService: PortfolioProjectService;
  publish: PortfolioPublishService;
  build: PortfolioBuildService;
  preview: PortfolioPreviewService;
  publicPages: PortfolioPublicService;
  events: PortfolioEventsService;
}

export function createPortfolioContainer(o: PortfolioOverrides = {}): PortfolioContainer {
  const now = o.now ?? (() => new Date());
  const baseUrl = o.baseUrl ?? portfolioBaseUrl;
  const storagePrefix = o.storagePrefix ?? portfolioStoragePrefix();
  const portfolios = o.portfolios ?? new PrismaPortfolioRepository();
  const projects = o.projects ?? new PrismaPortfolioProjectRepository();
  const builds = o.builds ?? new PrismaPortfolioBuildRepository();
  const reservations = o.reservations ?? new PrismaPortfolioSlugReservationRepository();
  const source = o.source ?? new PrismaPortfolioSourceRepository();
  const tx = o.tx ?? new PrismaTxRunner();
  const outbox = o.outbox ?? new PrismaPortfolioOutbox();
  const notifier = o.notifier ?? new PrismaPortfolioNotifier();
  const config = o.config ?? new RuntimePortfolioConfig();
  const audit = o.audit ?? new ServicePortfolioAudit();
  const emitter = o.emitter ?? new SocketPortfolioEmitter();
  const storage = o.storage ?? new ObjectPortfolioStorage();
  const assets = o.assets ?? new PublicPortfolioAssets();
  const cache = o.cache ?? new RedisPortfolioCache();
  const career = o.career ?? createSkillBadgeReadPort();
  const contribution = o.contribution ?? createContributionReadPort();
  const reports = o.reports ?? createReportPort();

  const slugs = new PortfolioSlugService(portfolios, reservations, config, now);
  const scheduler = new PortfolioBuildScheduler(portfolios, builds, outbox);
  const snapshots = new PortfolioSnapshotService(source, contribution, { visibilityOf: async (userId) => (await career.career(userId)).visibility }, o.snapshotTimeoutMs);
  const composer = new PortfolioPageComposer(source, career, o.images ?? new PortfolioImageService(assets), new PortfolioRenderer(o.htmlMaxBytes), baseUrl);
  const portfolio = new PortfolioService({ portfolios, projects, builds, reservations, slugs, source, assets, tx, scheduler, cache, config, now, baseUrl });
  return {
    portfolios,
    projects,
    builds,
    reservations,
    config,
    cache,
    storage,
    baseUrl,
    slugs,
    snapshots,
    composer,
    portfolio,
    projectService: new PortfolioProjectService({ portfolios, projects, source, snapshots, assets, tx, portfolio, now }),
    publish: new PortfolioPublishService({ portfolios, projects, builds, career, scheduler, tx, outbox, notifier, cache, audit, reports, now, baseUrl }),
    build: new PortfolioBuildService({ portfolios, projects, builds, snapshots, composer, storage, tx, outbox, notifier, emitter, cache, storagePrefix, baseUrl, now, timeoutMs: o.buildTimeoutMs }),
    preview: new PortfolioPreviewService(portfolios, projects, composer, now),
    publicPages: new PortfolioPublicService(portfolios, reservations, storage, cache, config, storagePrefix, now),
    events: new PortfolioEventsService({ portfolios, projects, builds, reservations, scheduler, tx, outbox, assets, storage, cache, storagePrefix, now }),
  };
}

let instance: PortfolioContainer | null = null;

/** MỘT đồ thị cho API (`portfolio.routes.ts`) lẫn worker (`jobs/portfolio.jobs.ts` — worker không import `router.ts`). */
export function getPortfolioContainer(): PortfolioContainer {
  if (!instance) instance = createPortfolioContainer();
  return instance;
}
