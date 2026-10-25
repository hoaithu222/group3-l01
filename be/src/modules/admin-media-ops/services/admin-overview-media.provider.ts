import { LIMITS } from "../../../core/constants/limits";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "../../../core/utils/local-date";
import type { AdminOverviewMedia, AdminOverviewMediaProvider } from "../../../shared/ports/admin-overview-media.port";
import type { IMediaOpsStatsReader } from "../repositories/media-ops-read.repository.interface";
import type { CachePort } from "./admin-media-cache";

const DAY_MS = 86_400_000;
const CACHE_KEY = "admin-media:overview";

/**
 * KPI gọi & họp cho `GET /admin/overview` (p2-07 be.md §5.7): cuộc họp đang diễn ra, cuộc gọi hôm nay (từ 00:00 `Asia/Ho_Chi_Minh`), phút gọi 7 ngày, dung lượng ghi hình, ghi hình lỗi 24 giờ.
 * Cache `overviewCacheSeconds` (60 s). `admin-overview` nhận provider này qua cổng `shared/ports/admin-overview-media.port` (đăng ký lúc boot) — không import module.
 */
export class AdminOverviewMediaProviderImpl implements AdminOverviewMediaProvider {
  constructor(
    private readonly reader: IMediaOpsStatsReader,
    private readonly cache: CachePort,
    private readonly now: () => Date = () => new Date()
  ) {}

  async get(): Promise<AdminOverviewMedia> {
    const cached = await this.cache.get<AdminOverviewMedia>(CACHE_KEY);
    if (cached) return cached;
    const now = this.now();
    const c = await this.reader.overviewCounts(startOfLocalDay(now, DEFAULT_TIME_ZONE), new Date(now.getTime() - 7 * DAY_MS), new Date(now.getTime() - DAY_MS));
    const result: AdminOverviewMedia = {
      liveMeetings: c.liveMeetings,
      callsToday: c.callsToday,
      callMinutes7d: Math.floor(c.callSeconds7d / 60),
      recordingStorageBytes: c.recordingStorageBytes,
      egressFailed24h: c.egressFailed24h,
    };
    await this.cache.set(CACHE_KEY, result, LIMITS.adminMedia.overviewCacheSeconds);
    return result;
  }
}
