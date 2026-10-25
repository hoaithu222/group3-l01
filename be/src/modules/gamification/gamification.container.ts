import { enqueue, toSafeJobId } from "../../infrastructure/queue";
import { createEquippedItemsReader } from "../coins/public";
import { PrismaBadgeRepository } from "./repositories/badge.repository.prisma";
import { PrismaGamDirectory } from "./repositories/directory";
import { PrismaGamNotifier, PrismaGamOutbox, PrismaTxRunner } from "./repositories/tx";
import { PrismaUserBadgeRepository } from "./repositories/user-badge.repository.prisma";
import { PrismaUserGamificationRepository } from "./repositories/user-gamification.repository.prisma";
import { PrismaXpEventRepository } from "./repositories/xp-event.repository.prisma";
import { PrismaXpRuleRepository } from "./repositories/xp-rule.repository.prisma";
import { BadgeAdminService, type IGamJobs } from "./services/badge-admin.service";
import { PublicAssetsGamBadgeIcons } from "./services/badge-icon.port";
import { BadgeService } from "./services/badge.service";
import { GamificationAdminService } from "./services/gamification-admin.service";
import { GamificationQueryService } from "./services/gamification-query.service";
import { GamificationUserDataEraser, LevelUpNotifier, StreakCheckService, XpEventHandler } from "./services/gamification-jobs.services";
import { ServiceGamAudit, SocketGamEmitter, SystemConfigGamPort } from "./services/gamification.ports";
import { LeaderboardService, RedisLeaderboardCache } from "./services/leaderboard.service";
import { LevelConfigService } from "./services/level-config.service";
import { XpAdjustService } from "./services/xp-adjust.service";
import { XpConsumerService } from "./services/xp-consumer.service";
import { XpRuleService } from "./services/xp-rule.service";

/** Xếp `badge.backfill` (queue `gamification`); `jobId` tất định theo huy hiệu + phiên bản (dấu `:` đổi `_` — `toSafeJobId`, vì `enqueue` trực tiếp không qua relay). */
class QueueGamJobs implements IGamJobs {
  async enqueueBackfill(badgeId: string, version: number): Promise<string> {
    const jobId = toSafeJobId(`badge.backfill:badge:${badgeId}:v${version}`);
    await enqueue("gamification", "badge.backfill", { badgeId, version }, { jobId });
    return jobId;
  }
}

export interface GamificationContainer {
  rules: XpRuleService;
  levels: LevelConfigService;
  consumer: XpConsumerService;
  xpHandler: XpEventHandler;
  badges: BadgeService;
  query: GamificationQueryService;
  leaderboard: LeaderboardService;
  badgeAdmin: BadgeAdminService;
  adjust: XpAdjustService;
  admin: GamificationAdminService;
  levelUp: LevelUpNotifier;
  streaks: StreakCheckService;
  userData: GamificationUserDataEraser;
  /** Dùng cho `registerGamificationIntegrations` (gate `BADGE` + resolver `BADGE_ICON`) — cùng repository/thư mục với các service. */
  badgeRepo: PrismaBadgeRepository;
  directory: PrismaGamDirectory;
}

let instance: GamificationContainer | null = null;

/**
 * Nối DI cho module `gamification` (Prisma + Redis + Socket thật) — MỘT lần cho API (`gamification.routes.ts`, `gamification.admin.routes.ts`) lẫn worker
 * (`jobs/gamification.jobs.ts`), vì tiến trình worker không import `router.ts`.
 */
export function getGamificationContainer(): GamificationContainer {
  if (instance) return instance;

  const tx = new PrismaTxRunner();
  const outbox = new PrismaGamOutbox();
  const notifier = new PrismaGamNotifier();
  const audit = new ServiceGamAudit();
  const emitter = new SocketGamEmitter();
  const directory = new PrismaGamDirectory();
  const users = new PrismaUserGamificationRepository();
  const events = new PrismaXpEventRepository();
  const badgeRepo = new PrismaBadgeRepository();
  const userBadges = new PrismaUserBadgeRepository();
  const rules = new XpRuleService(new PrismaXpRuleRepository(), audit);
  const levels = new LevelConfigService(new SystemConfigGamPort());
  const badges = new BadgeService({ badges: badgeRepo, userBadges, gamification: users, notifier, tx });
  const consumer = new XpConsumerService({ rules, levels, events, users, directory, badges, tx, outbox, emitter });
  const query = new GamificationQueryService({ users, badges: badgeRepo, userBadges, events, directory, levels, equipped: createEquippedItemsReader() });

  instance = {
    rules,
    levels,
    consumer,
    xpHandler: new XpEventHandler(consumer),
    badges,
    query,
    leaderboard: new LeaderboardService({ events, directory, users, cache: new RedisLeaderboardCache() }),
    badgeAdmin: new BadgeAdminService({ badges: badgeRepo, userBadges, badgeService: badges, audit, jobs: new QueueGamJobs(), icons: new PublicAssetsGamBadgeIcons(), tx }),
    adjust: new XpAdjustService({ users, events, directory, levels, badges, tx, outbox, audit, emitter }),
    admin: new GamificationAdminService({ query, badges: badgeRepo, userBadges, directory }),
    levelUp: new LevelUpNotifier({ notifier, tx }),
    streaks: new StreakCheckService({ users, emitter }),
    userData: new GamificationUserDataEraser({ users, userBadges, events }),
    badgeRepo,
    directory,
  };
  return instance;
}
