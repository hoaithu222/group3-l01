import { runtimeConfig } from "../../core/config/runtime-config";
import { MODULES, type ModuleId } from "../../core/constants/modules";
import { buildWindow, metricOf, splitSeries, type InsightsWindow } from "./admin-overview-insights.window";
import type { AdminInsights, InsightsBreakdowns, InsightsHeatmap, InsightsKpis, InsightsRange, InsightsSeries, InsightsTopWorkspace } from "./admin-overview-insights.types";
import { activeUsersAgg, getSystemStartAt, HEATMAP_TZ, messageAgg, userSnapshots, usersCreatedByDay } from "./admin-overview-insights.queries";
import { badgesUnlockedByDay, callAgg, levelDistribution, nameTopWorkspaces, reportStatusCounts, xpAgg } from "./admin-overview-insights.module-queries";

export type { AdminInsights, InsightsRange } from "./admin-overview-insights.types";

/**
 * Cache trong bộ nhớ tiến trình theo `range` ~60 s (cùng tinh thần `getCachedRealtime`): truy vấn insights quét nhiều bảng lớn (Message, Session…), trong khi
 * trang Tổng quan chỉ cần số liệu "đủ mới" — admin mở/refetch liên tục không nên bắt DB quét lại. Nhiều instance thì mỗi instance cache riêng, sai lệch tối đa
 * ~60 s giữa các instance (chấp nhận được: đây là số hiển thị, không phải nguồn quyết định nghiệp vụ). `generatedAt` cho FE hiện "Cập nhật lúc …".
 * `inflight` gộp các lần gọi đồng thời lúc cache nguội về MỘT lần tính (tránh dồn truy vấn nặng khi nhiều admin cùng vào).
 */
const INSIGHTS_CACHE_MS = 60_000;
const cache = new Map<InsightsRange, { at: number; value: AdminInsights }>();
const inflight = new Map<InsightsRange, Promise<AdminInsights>>();

export function getAdminInsights(range: InsightsRange): Promise<AdminInsights> {
  const hit = cache.get(range);
  if (hit && Date.now() - hit.at < INSIGHTS_CACHE_MS) return Promise.resolve(hit.value);
  const pending = inflight.get(range);
  if (pending) return pending;
  // Chỉ cache khi tính XONG và thành công — lỗi lõi (ném) không bị cache, lần gọi sau thử lại.
  const started = buildAdminInsights(range)
    .then((value) => {
      cache.set(range, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(range));
  inflight.set(range, started);
  return started;
}

/** Một khối phân hệ: chỉ chứa phần của nó; `assemble` ghép các khối còn sống lại. */
interface Part {
  kpis?: Partial<InsightsKpis>;
  series?: Partial<InsightsSeries>;
  previousSeries?: Partial<InsightsSeries>;
  breakdowns?: Partial<InsightsBreakdowns>;
  activityHeatmap?: InsightsHeatmap;
  topWorkspaces?: InsightsTopWorkspace[];
}

/** Đọc cờ; lỗi đọc cờ → coi như TẮT (ẩn khối thay vì kéo cả endpoint xuống). */
const enabled = (m: ModuleId): Promise<boolean> => runtimeConfig.isFeatureEnabled(m).catch(() => false);

/** Khối lỗi → `undefined` (bỏ khối đó, FE ẩn), giống `loadMedia` ở `admin-overview.service.ts`. */
async function optional(load: () => Promise<Part>): Promise<Part | undefined> {
  try {
    return await load();
  } catch {
    return undefined;
  }
}

/** Cờ `communication`: tin nhắn, bản đồ nhiệt, top workspace, báo cáo theo trạng thái, tin theo phạm vi. */
async function loadCommunication(w: InsightsWindow, comparable: boolean): Promise<Part> {
  const [agg, reportStatus] = await Promise.all([messageAgg(w), reportStatusCounts(w)]);
  const messages = splitSeries(agg.byDay, w);
  const max = agg.cells.reduce((m, row) => Math.max(m, ...row), 0);
  return {
    kpis: { messages: metricOf(messages.totalCurrent, messages.totalPrevious, comparable) },
    series: { messages: messages.current },
    previousSeries: { messages: messages.previous },
    breakdowns: { reportStatus, messageScope: agg.scope },
    activityHeatmap: { timezone: HEATMAP_TZ, cells: agg.cells, max },
    topWorkspaces: await nameTopWorkspaces(agg.topWorkspaces),
  };
}

/** Cờ `voice` HOẶC `meeting`: số cuộc gọi, tổng phút, loại media. Phút làm tròn từ TỔNG GIÂY (không cộng các số đã làm tròn theo ngày). */
async function loadCalls(w: InsightsWindow, comparable: boolean): Promise<Part> {
  const agg = await callAgg(w);
  const calls = splitSeries(agg.byDay, w);
  const minutes = splitSeries(agg.secondsByDay, w, (sec) => Math.round(sec / 60));
  return {
    kpis: {
      calls: metricOf(calls.totalCurrent, calls.totalPrevious, comparable),
      callMinutes: metricOf(Math.round(minutes.totalCurrent / 60), Math.round(minutes.totalPrevious / 60), comparable),
    },
    series: { calls: calls.current, callMinutes: minutes.current },
    previousSeries: { calls: calls.previous, callMinutes: minutes.previous },
    breakdowns: { callMedia: agg.media },
  };
}

/** Cờ `gamification`: XP cấp, huy hiệu mở khoá, XP theo nguồn, phân bố cấp độ. */
async function loadGamification(w: InsightsWindow, comparable: boolean): Promise<Part> {
  const [xp, badgesByDay, levels] = await Promise.all([xpAgg(w), badgesUnlockedByDay(w), levelDistribution()]);
  const xpSeries = splitSeries(xp.byDay, w);
  const badges = splitSeries(badgesByDay, w);
  return {
    kpis: {
      xpAwarded: metricOf(xpSeries.totalCurrent, xpSeries.totalPrevious, comparable),
      badgesUnlocked: metricOf(badges.totalCurrent, badges.totalPrevious, comparable),
    },
    series: { xp: xpSeries.current },
    previousSeries: { xp: xpSeries.previous },
    breakdowns: { xpBySource: xp.bySource, levelDistribution: levels },
  };
}

async function buildAdminInsights(range: InsightsRange): Promise<AdminInsights> {
  const w = buildWindow(range);

  // Cờ phân hệ + mốc "hệ thống bắt đầu" + phần lõi chạy song song; khối phân hệ chỉ khởi động sau khi biết cờ + `comparable`.
  const [communication, voice, meeting, gamification, systemStartAt, signups, active, snapshots] = await Promise.all([
    enabled(MODULES.COMMUNICATION),
    enabled(MODULES.VOICE),
    enabled(MODULES.MEETING),
    enabled(MODULES.GAMIFICATION),
    getSystemStartAt(),
    usersCreatedByDay(w),
    activeUsersAgg(w),
    userSnapshots(),
  ]);

  // Kỳ trước so sánh được CHỈ khi hệ thống đã chạy từ trước đầu kỳ trước (User cũ nhất không mới hơn `previousStart`); `previous = 0` vẫn là số thật.
  const comparable = systemStartAt !== null && systemStartAt.getTime() <= w.previousStart.getTime();

  const [comm, calls, gami] = await Promise.all([
    communication ? optional(() => loadCommunication(w, comparable)) : undefined,
    voice || meeting ? optional(() => loadCalls(w, comparable)) : undefined,
    gamification ? optional(() => loadGamification(w, comparable)) : undefined,
  ]);

  const newUsers = splitSeries(signups, w);
  const activeSeries = splitSeries(active.byDay, w);

  // Khối vắng (cờ tắt hoặc lỗi) → spread `undefined` = không thêm khoá nào, đúng quy ước "trường vắng = ẩn khối".
  return {
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      totalUsers: snapshots.totalUsers,
      newUsers: metricOf(newUsers.totalCurrent, newUsers.totalPrevious, comparable),
      activeUsers: metricOf(active.current, active.previous, comparable),
      ...comm?.kpis,
      ...calls?.kpis,
      ...gami?.kpis,
    },
    series: { signups: newUsers.current, activeUsers: activeSeries.current, ...comm?.series, ...calls?.series, ...gami?.series },
    previousSeries: { signups: newUsers.previous, activeUsers: activeSeries.previous, ...comm?.previousSeries, ...calls?.previousSeries, ...gami?.previousSeries },
    breakdowns: { userStatus: snapshots.status, userRole: snapshots.role, ...comm?.breakdowns, ...calls?.breakdowns, ...gami?.breakdowns },
    ...(comm?.activityHeatmap && { activityHeatmap: comm.activityHeatmap }),
    ...(comm?.topWorkspaces && { topWorkspaces: comm.topWorkspaces }),
  };
}
