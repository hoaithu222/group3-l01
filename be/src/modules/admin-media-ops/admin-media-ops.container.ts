import { getLiveKit, type IMediaServer } from "../../infrastructure/media";
import { getQueue } from "../../infrastructure/queue";
import { redis } from "../../infrastructure/redis";
import { AuditService } from "../audit-log/audit-log.service";
import { PrismaMediaOpsCallReader } from "./repositories/media-ops-call.reader.prisma";
import { PrismaMediaOpsForceEndRepository } from "./repositories/media-ops-force-end.repository.prisma";
import { PrismaMediaOpsHealthReader } from "./repositories/media-ops-health.reader.prisma";
import { PrismaMediaOpsMeetingReader } from "./repositories/media-ops-meeting.reader.prisma";
import type { IMediaOpsCallReader, IMediaOpsHealthReader, IMediaOpsMeetingReader, IMediaOpsStatsReader } from "./repositories/media-ops-read.repository.interface";
import { PrismaMediaOpsStatsReader } from "./repositories/media-ops-stats.reader.prisma";
import type { IMediaOpsForceEndRepository } from "./repositories/media-ops-force-end.repository.interface";
import { PrismaOutboxPort, PrismaTxRunner, type IOutboxPort, type ITxRunner } from "./repositories/tx";
import { RedisCache, type CachePort } from "./services/admin-media-cache";
import { AdminMediaForceEndService, type AuditPort } from "./services/admin-media-force-end.service";
import { AdminMediaHealthService, type QueueCounts, type TurnProbe } from "./services/admin-media-health.service";
import { AdminMediaQueryService, type ActiveRoomsPort } from "./services/admin-media-query.service";
import { LiveKitRoomsProbe } from "./services/admin-media-rooms.probe";
import { AdminMediaStatsService } from "./services/admin-media-stats.service";
import { AdminOverviewMediaProviderImpl } from "./services/admin-overview-media.provider";

export interface AdminMediaOpsOverrides {
  meetings?: IMediaOpsMeetingReader;
  calls?: IMediaOpsCallReader;
  stats?: IMediaOpsStatsReader;
  healthReader?: IMediaOpsHealthReader;
  forceEndRepo?: IMediaOpsForceEndRepository;
  tx?: ITxRunner;
  outbox?: IOutboxPort;
  audit?: AuditPort;
  cache?: CachePort;
  media?: () => IMediaServer;
  rooms?: ActiveRoomsPort;
  queueCounts?: (name: "calls" | "media") => Promise<QueueCounts>;
  turnProbe?: () => Promise<TurnProbe | null>;
  now?: () => Date;
}

export interface AdminMediaOpsContainer {
  query: AdminMediaQueryService;
  stats: AdminMediaStatsService;
  health: AdminMediaHealthService;
  forceEnd: AdminMediaForceEndService;
  overview: AdminOverviewMediaProviderImpl;
}

/** Khoá Redis do job probe TURN của p0-08 ghi (`{ at, ok, error? }`); chưa có job/khoá → health báo `turn: UNKNOWN`. */
const TURN_PROBE_KEY = "media:turn-probe:last";

/** Dựng đồ thị phụ thuộc (DI thủ công) — routes dùng chung; test thay từng phần qua `overrides`. */
export function createAdminMediaOpsContainer(o: AdminMediaOpsOverrides = {}): AdminMediaOpsContainer {
  const media = o.media ?? getLiveKit;
  const cache = o.cache ?? new RedisCache();
  const statsReader = o.stats ?? new PrismaMediaOpsStatsReader();
  return {
    query: new AdminMediaQueryService(o.meetings ?? new PrismaMediaOpsMeetingReader(), o.calls ?? new PrismaMediaOpsCallReader(), o.rooms ?? new LiveKitRoomsProbe(media)),
    stats: new AdminMediaStatsService(statsReader, cache, o.now),
    health: new AdminMediaHealthService({
      media,
      reader: o.healthReader ?? new PrismaMediaOpsHealthReader(),
      cache,
      queueCounts:
        o.queueCounts ??
        (async (name) => {
          const c = await getQueue(name).getJobCounts("waiting", "delayed", "failed");
          return { waiting: c.waiting ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
        }),
      turnProbe: o.turnProbe ?? (() => redis.get<TurnProbe>(TURN_PROBE_KEY)),
      now: o.now,
    }),
    forceEnd: new AdminMediaForceEndService(o.forceEndRepo ?? new PrismaMediaOpsForceEndRepository(), o.tx ?? new PrismaTxRunner(), o.outbox ?? new PrismaOutboxPort(), o.audit ?? new AuditService(), o.now),
    overview: new AdminOverviewMediaProviderImpl(statsReader, cache, o.now),
  };
}

let container: AdminMediaOpsContainer | null = null;

export function getAdminMediaOpsContainer(): AdminMediaOpsContainer {
  container ??= createAdminMediaOpsContainer();
  return container;
}

/** Test: thay container (`null` = dựng lại mặc định lần sau). */
export function setAdminMediaOpsContainerForTests(next: AdminMediaOpsContainer | null): void {
  container = next;
}
