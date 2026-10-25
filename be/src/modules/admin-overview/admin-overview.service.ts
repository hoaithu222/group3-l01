import { runtimeConfig } from "../../core/config/runtime-config";
import { MODULES } from "../../core/constants/modules";
import { prisma } from "../../infrastructure/database";
import { registryCountAll } from "../../infrastructure/socket";
import { getAdminOverviewMediaProvider, type AdminOverviewMedia } from "../../shared/ports/admin-overview-media.port";
import { DAY_MS, startOfUtcDay, toDateKey } from "./admin-overview-insights.window";

export interface OverviewSeriesPoint {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

export interface AdminOverviewRealtime {
  socketConnections: number;
  onlineUsers: number;
}

export interface AdminOverview {
  newUsers7d: number;
  /**
   * Số workspace `ACTIVE` có `lastActivityAt` trong 7 ngày gần nhất. CHỈ tính khi cờ `communication` bật; cờ tắt hoặc đếm lỗi → 0
   * (dashboard ẩn thẻ khi cờ tắt nên 0 ở đây không bị hiểu nhầm là "không có workspace").
   */
  activeWorkspaces: number;
  /** Số `Report` kiểm duyệt đang `OPEN`. Cùng quy tắc cờ `communication` / lỗi → 0 như `activeWorkspaces`. */
  openReports: number;
  /** ⏸ D-13 — job AI đang tạm dừng, luôn 0. */
  failedAiJobs24h: number;
  activeUsersSeries: OverviewSeriesPoint[];
  /** p0-03 admin.md — đếm qua Redis `conn:*`, cache 30s (`REALTIME_CACHE_MS`), không đo theo thời gian thực từng request. */
  realtime: AdminOverviewRealtime;
  /**
   * (p2-07) KPI gọi & họp — CHỈ có khi provider đã đăng ký (`admin-media-ops`) VÀ cờ `meeting` hoặc `voice` đang bật; vắng khi cả hai tắt
   * (dashboard ẩn khối). Lỗi khi tính → bỏ khối chứ không làm hỏng cả dashboard.
   */
  media?: AdminOverviewMedia;
  /**
   * (p5-01 admin.md §2.3) KPI "Phiên thi đang chạy" — số phiên live quiz đang diễn ra (`status = IN_PROGRESS`; phòng chờ `WAITING` chưa tính).
   * CHỈ có khi cờ `live-quiz` đang bật; vắng khi cờ tắt (dashboard ẩn thẻ). Lỗi khi đọc cờ/đếm → bỏ trường chứ không làm hỏng cả dashboard.
   * Chỉ SỐ ĐẾM — không PIN/id/tên (khớp `GET /admin/live-quiz/sessions`, không lộ PIN).
   */
  liveQuizActive?: number;
}

const REALTIME_CACHE_MS = 30_000;
let realtimeCache: { at: number; value: AdminOverviewRealtime } | null = null;

/**
 * `registryCountAll()` quét Redis (`SCAN conn:*`) — không rẻ nếu gọi mỗi lần
 * dashboard admin refetch. Cache trong bộ nhớ tiến trình 30s (đủ cho 1 ô KPI
 * không cần chính xác tới giây); nhiều instance admin API thì mỗi instance tự
 * cache riêng, sai lệch tối đa 30s giữa các instance — chấp nhận được cho một
 * con số hiển thị, không phải nguồn quyết định nghiệp vụ.
 */
async function getCachedRealtime(): Promise<AdminOverviewRealtime> {
  const now = Date.now();
  if (realtimeCache && now - realtimeCache.at < REALTIME_CACHE_MS) return realtimeCache.value;
  const value = await registryCountAll();
  realtimeCache = { at: now, value };
  return value;
}

// `DAY_MS`/`toDateKey`/`startOfUtcDay` dùng chung với insights (cùng quy ước ngày UTC) — định nghĩa ở `admin-overview-insights.window.ts`.
const RANGE_DAYS: Record<string, number> = { "7d": 7 };

/**
 * Chuỗi "người dùng hoạt động theo ngày" tính từ `Session.lastUsedAt` (đăng
 * nhập/refresh trong ngày) — không dùng Prisma `groupBy` vì MongoDB qua Prisma
 * chưa hỗ trợ group theo phần ngày của DateTime; số lượng session ở Phase 0
 * còn nhỏ nên gộp ở tầng ứng dụng. Xem lại (Atlas aggregation `$dateTrunc`)
 * khi số phiên/ngày đủ lớn để ảnh hưởng hiệu năng.
 */
async function buildActiveUsersSeries(days: number, now: Date): Promise<OverviewSeriesPoint[]> {
  const rangeStart = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);

  const sessions = await prisma.session.findMany({
    where: { lastUsedAt: { gte: rangeStart } },
    select: { userId: true, lastUsedAt: true },
  });

  const usersByDay = new Map<string, Set<string>>();
  for (let i = 0; i < days; i += 1) {
    usersByDay.set(toDateKey(new Date(rangeStart.getTime() + i * DAY_MS)), new Set());
  }
  for (const s of sessions) {
    const key = toDateKey(startOfUtcDay(s.lastUsedAt));
    usersByDay.get(key)?.add(s.userId);
  }

  return Array.from(usersByDay.entries()).map(([date, users]) => ({ date, count: users.size }));
}

/** KPI gọi & họp (p2-07): provider chưa đăng ký hoặc cả `meeting`/`voice` tắt → `undefined`; lỗi → `undefined` (không kéo cả dashboard xuống). */
async function loadMedia(): Promise<AdminOverviewMedia | undefined> {
  const provider = getAdminOverviewMediaProvider();
  if (!provider) return undefined;
  try {
    const [meeting, voice] = await Promise.all([runtimeConfig.isFeatureEnabled(MODULES.MEETING), runtimeConfig.isFeatureEnabled(MODULES.VOICE)]);
    return meeting || voice ? await provider.get() : undefined;
  } catch {
    return undefined;
  }
}

/** KPI live quiz (p5-01): cờ `live-quiz` tắt → `undefined`; lỗi → `undefined` (không kéo cả dashboard xuống). Dùng index `(status, updatedAt)`. */
async function loadLiveQuizActive(): Promise<number | undefined> {
  try {
    if (!(await runtimeConfig.isFeatureEnabled(MODULES.LIVE_QUIZ))) return undefined;
    return await prisma.liveQuizSession.count({ where: { status: "IN_PROGRESS" } });
  } catch {
    return undefined;
  }
}

/**
 * KPI cộng đồng: workspace sôi động 7 ngày (index `(status, lastActivityAt)`) và báo cáo đang mở (index `(status, createdAt)`). Cờ `communication` tắt → 0;
 * mỗi phép đếm lỗi riêng → 0 (một cái hỏng không kéo cái kia, càng không làm hỏng cả dashboard).
 */
async function loadCommunityKpis(since: Date): Promise<{ activeWorkspaces: number; openReports: number }> {
  const none = { activeWorkspaces: 0, openReports: 0 };
  try {
    if (!(await runtimeConfig.isFeatureEnabled(MODULES.COMMUNICATION))) return none;
    const [activeWorkspaces, openReports] = await Promise.all([
      prisma.workspace.count({ where: { status: "ACTIVE", lastActivityAt: { gte: since } } }).catch(() => 0),
      prisma.report.count({ where: { status: "OPEN" } }).catch(() => 0),
    ]);
    return { activeWorkspaces, openReports };
  } catch {
    return none;
  }
}

export async function buildAdminOverview(range: "7d"): Promise<AdminOverview> {
  const now = new Date();
  const days = RANGE_DAYS[range];
  const rangeStart = new Date(now.getTime() - days * DAY_MS);

  const [newUsers7d, activeUsersSeries, realtime, media, liveQuizActive, community] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: rangeStart } } }),
    buildActiveUsersSeries(days, now),
    getCachedRealtime(),
    loadMedia(),
    loadLiveQuizActive(),
    loadCommunityKpis(rangeStart),
  ]);

  return {
    newUsers7d,
    activeWorkspaces: community.activeWorkspaces,
    openReports: community.openReports,
    failedAiJobs24h: 0,
    activeUsersSeries,
    realtime,
    ...(media ? { media } : {}),
    ...(liveQuizActive !== undefined ? { liveQuizActive } : {}),
  };
}
