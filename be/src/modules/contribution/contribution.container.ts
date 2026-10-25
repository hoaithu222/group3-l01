import { PrismaActivityDailyRepository } from "./repositories/activity-daily.repository.prisma";
import { PrismaActivitySourceRepository } from "./repositories/activity-source.repository.prisma";
import type { IActivityDailyRepository } from "./repositories/activity-daily.repository.interface";
import type { IActivitySourceRepository } from "./repositories/activity-source.repository.interface";
import { PrismaContributionDirectory } from "./repositories/contribution-directory.repository.prisma";
import type { IBoardContributionWriter, IContributionDirectory } from "./repositories/contribution-directory.repository.interface";
import { PrismaContributionExportRepository } from "./repositories/contribution-export.repository.prisma";
import type { IContributionExportRepository } from "./repositories/contribution-export.repository.interface";
import { PrismaContributionFactRepository } from "./repositories/contribution-fact.repository.prisma";
import type { IContributionFactRepository } from "./repositories/contribution-fact.repository.interface";
import { PrismaContributionSnapshotRepository } from "./repositories/contribution-snapshot.repository.prisma";
import type { IContributionSnapshotRepository } from "./repositories/contribution-snapshot.repository.interface";
import { PrismaContributionSourceRepository } from "./repositories/contribution-source.repository.prisma";
import type { IContributionSourceRepository } from "./repositories/contribution-source.repository.interface";
import { PrismaContributionStateRepository } from "./repositories/contribution-state.repository.prisma";
import type { IContributionStateRepository } from "./repositories/contribution-state.repository.interface";
import { PrismaContribNotifier, PrismaContribOutbox, PrismaTxRunner, type IContribNotifier, type IContribOutbox, type ITxRunner } from "./repositories/tx";
import { ActivityRefreshService } from "./services/activity-refresh.service";
import { ContributionAccess } from "./services/contribution-access";
import { ContributionComputer } from "./services/contribution-computer";
import { ContributionConfigService } from "./services/contribution-config.service";
import { ContributionContextLoader } from "./services/contribution-context";
import { ContributionFactsService } from "./services/contribution-facts.service";
import { ContributionMemberTasksService } from "./services/contribution-member-tasks.service";
import { ContributionReadService } from "./services/contribution-read.service";
import { ContributionReconcileService } from "./services/contribution-reconcile.service";
import { ContributionService } from "./services/contribution.service";
import { ContributionTimezoneSync } from "./services/contribution-timezone.service";
import { ContributionStatsService } from "./services/contribution-stats.service";
import {
  QueueContribJobs,
  RedisContribCache,
  RuntimeContribConfig,
  ServiceContribAudit,
  SocketContribEmitter,
  type IContribAudit,
  type IContribCache,
  type IContribConfigPort,
  type IContribEmitter,
  type IContribQueue,
} from "./services/contribution.ports";
import { ExportDataBuilder } from "./services/export/contribution-export-data";
import { ContributionExportJobService } from "./services/export/contribution-export-job.service";
import { DefaultContribPdf, PublicContribAssets, type IContribAssets, type IContribPdf } from "./services/export/contribution-export.ports";
import { ContributionExportService } from "./services/export/contribution-export.service";
import { ExportAssetReadResolver } from "./services/export-asset-read.resolver";
import { HeatmapService } from "./services/heatmap.service";

/** Cổng thay được khi dựng lại đồ thị cho test (mặc định là bản thật). */
export interface ContributionOverrides {
  config?: IContribConfigPort;
  queue?: IContribQueue;
  audit?: IContribAudit;
  emitter?: IContribEmitter;
  cache?: IContribCache;
  assets?: IContribAssets;
  pdf?: IContribPdf;
  notifier?: IContribNotifier;
  outbox?: IContribOutbox;
  tx?: ITxRunner;
  now?: () => Date;
}

export interface ContributionContainer {
  directory: IContributionDirectory & IBoardContributionWriter;
  facts: IContributionFactRepository;
  states: IContributionStateRepository;
  snapshots: IContributionSnapshotRepository;
  daily: IActivityDailyRepository;
  activitySource: IActivitySourceRepository;
  exportRepo: IContributionExportRepository;
  source: IContributionSourceRepository;
  access: ContributionAccess;
  reports: ContributionService;
  memberTasks: ContributionMemberTasksService;
  config: ContributionConfigService;
  heatmap: HeatmapService;
  refresh: ActivityRefreshService;
  factsService: ContributionFactsService;
  reconcile: ContributionReconcileService;
  timezoneSync: ContributionTimezoneSync;
  exports: ContributionExportService;
  exportJobs: ContributionExportJobService;
  stats: ContributionStatsService;
  read: ContributionReadService;
  assetReadResolver: ExportAssetReadResolver;
}

/** Dựng đồ thị phụ thuộc (Prisma + Redis + Socket thật, thay được từng cổng để test). */
export function createContributionContainer(o: ContributionOverrides = {}): ContributionContainer {
  const directory = new PrismaContributionDirectory();
  const facts = new PrismaContributionFactRepository();
  const states = new PrismaContributionStateRepository();
  const snapshots = new PrismaContributionSnapshotRepository();
  const daily = new PrismaActivityDailyRepository();
  const activitySource = new PrismaActivitySourceRepository();
  const exportRepo = new PrismaContributionExportRepository();
  const source = new PrismaContributionSourceRepository();
  const configPort = o.config ?? new RuntimeContribConfig((workspaceId) => directory.getWorkspaceTimezone(workspaceId));
  const queue = o.queue ?? new QueueContribJobs();
  const tx = o.tx ?? new PrismaTxRunner();
  const now = o.now;

  const access = new ContributionAccess(directory);
  const context = new ContributionContextLoader(states, configPort);
  const computer = new ContributionComputer(facts, directory);
  const reports = new ContributionService({ access, context, computer, snapshots, states, directory, cache: o.cache ?? new RedisContribCache(), queue, now });
  const refresh = new ActivityRefreshService({ daily, activitySource, boardSource: source, states, directory, config: configPort, now });
  const factsService = new ContributionFactsService({ facts, states, source, config: configPort, queue, now });
  const builder = new ExportDataBuilder({ reports, directory, daily, refresh, now });
  const assets = o.assets ?? new PublicContribAssets();

  return {
    directory,
    facts,
    states,
    snapshots,
    daily,
    activitySource,
    exportRepo,
    source,
    access,
    reports,
    memberTasks: new ContributionMemberTasksService({ access, context, facts, directory }),
    config: new ContributionConfigService({
      access,
      context,
      states,
      directory,
      writer: directory,
      tx,
      audit: o.audit ?? new ServiceContribAudit(),
      queue,
      emitter: o.emitter ?? new SocketContribEmitter(),
      now,
    }),
    heatmap: new HeatmapService({ access, context, refresh, daily, states, directory, config: configPort }),
    refresh,
    factsService,
    reconcile: new ContributionReconcileService({ facts, source, factsService, now }),
    timezoneSync: new ContributionTimezoneSync({ states, config: configPort, factsService, now }),
    exports: new ContributionExportService({ access, context, builder, exports: exportRepo, assets, tx, outbox: o.outbox ?? new PrismaContribOutbox(), now }),
    exportJobs: new ContributionExportJobService({
      exports: exportRepo,
      directory,
      context,
      builder,
      pdf: o.pdf ?? new DefaultContribPdf(),
      assets,
      notifier: o.notifier ?? new PrismaContribNotifier(),
      tx,
      now,
    }),
    stats: new ContributionStatsService({ directory, states, exports: exportRepo, now }),
    read: new ContributionReadService(snapshots),
    assetReadResolver: new ExportAssetReadResolver(exportRepo, access, now),
  };
}

let instance: ContributionContainer | null = null;

/** MỘT đồ thị cho API (`contribution.routes.ts`) lẫn worker (`jobs/contribution.jobs.ts` — worker không import `router.ts`). */
export function getContributionContainer(): ContributionContainer {
  if (!instance) instance = createContributionContainer();
  return instance;
}
