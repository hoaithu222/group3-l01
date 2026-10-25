import type {
  AdminInsights,
  AdminOverview,
  InsightsMetric,
  InsightsSeriesPoint,
} from '@/core/api/admin';
import { formatNumber } from '@/shared/utils/format';

import { HIGHLIGHT_MAX, HIGHLIGHT_THRESHOLDS as T } from '../constants/insights.constants';
import type { Highlight, HighlightContext, HighlightLevel } from '../types/insights.types';
import { computeDelta } from './insight-delta.utils';
import { completeDays, meanCount, trailingZeroDays, utcDayBefore } from './insight-series.utils';
import { formatSeriesDayTick, summarizeOverviewSeries } from './overview-series.utils';

/** Nặng trước: lỗi → cảnh báo → tin tốt → thông tin. `sort` ổn định nên cùng mức giữ thứ tự khai luật. */
const LEVEL_ORDER: Record<HighlightLevel, number> = { error: 0, warning: 1, success: 2, info: 3 };

const fmtPct = (abs: number) => `${formatNumber(abs, abs < 10 ? 1 : 0)}%`;

/** Một chỉ số tăng/giảm ĐỦ LỚN so với kỳ trước ⇒ một câu; dưới ngưỡng ⇒ `null` (im lặng, đừng nói chuyện nhiễu). */
function changeHighlight(
  id: string,
  subject: string,
  metric: InsightsMetric | undefined,
  upPct: number,
  downPct: number,
): Highlight | null {
  const delta = computeDelta(metric);
  if (delta.pct === null || delta.direction === 'flat') return null;
  const abs = Math.abs(delta.pct);
  if (delta.direction === 'up' && abs >= upPct) {
    return { id, level: 'success', text: `${subject} tăng ${fmtPct(abs)} so với kỳ trước` };
  }
  if (delta.direction === 'down' && abs >= downPct) {
    return { id, level: 'warning', text: `${subject} giảm ${fmtPct(abs)} so với kỳ trước` };
  }
  return null;
}

/** Ngày cao nhất của chuỗi (trùng thì lấy ngày GẦN NHẤT). Rỗng ⇒ `undefined`. */
function peakOf(points: readonly InsightsSeriesPoint[]): InsightsSeriesPoint | undefined {
  let peak: InsightsSeriesPoint | undefined;
  for (const p of points) if (!peak || p.count >= peak.count) peak = p;
  return peak;
}

function activeUserRules(insights: AdminInsights): Highlight[] {
  const out: Highlight[] = [];
  const change = changeHighlight(
    'active-change',
    'Người dùng hoạt động',
    insights.kpis.activeUsers,
    T.activeUsersUpPct,
    T.activeUsersDownPct,
  );
  if (change) out.push(change);

  // Chỉ xét ngày TRỌN VẸN: "hôm nay" mới đi được một phần nên luôn thấp, so với trung bình là báo động giả.
  const days = completeDays(insights.series.activeUsers, insights.generatedAt);
  if (days.length < T.minDaysForPattern) return out;
  const last = days[days.length - 1];
  const earlierAvg = meanCount(days.slice(0, -1));
  if (earlierAvg >= T.minAveragePerDay && last.count < earlierAvg * (1 - T.yesterdayBelowAvgPct / 100)) {
    const isYesterday = last.date === utcDayBefore(insights.generatedAt.slice(0, 10));
    const gap = Math.round((1 - last.count / earlierAvg) * 100);
    out.push({
      id: 'active-yesterday-low',
      level: 'warning',
      text: `${isYesterday ? 'Hôm qua' : `Ngày ${formatSeriesDayTick(last.date)}`} chỉ có ${formatNumber(last.count)} người hoạt động, thấp hơn ${gap}% so với trung bình`,
    });
  }

  const summary = summarizeOverviewSeries(days);
  if (!summary) return out;
  if (summary.peak.count > 0) {
    out.push({
      id: 'active-peak',
      level: 'info',
      text: `Ngày đông nhất kỳ này: ${formatSeriesDayTick(summary.peak.date)} với ${formatNumber(summary.peak.count)} người hoạt động`,
    });
  }
  // Ngày cuối đã có chip "hôm qua" ở trên — không nhắc lại cùng một ngày hai lần.
  if (
    summary.low.date !== last.date &&
    summary.average >= T.minAveragePerDay &&
    summary.low.count <= (summary.average * T.lowDayPctOfAverage) / 100
  ) {
    const pct = Math.round((summary.low.count / summary.average) * 100);
    out.push({
      id: 'active-low',
      level: 'info',
      text: `Ngày ${formatSeriesDayTick(summary.low.date)} vắng nhất: ${formatNumber(summary.low.count)} người, chỉ bằng ${pct}% trung bình`,
    });
  }
  return out;
}

function signupRules(insights: AdminInsights): Highlight[] {
  const out: Highlight[] = [];
  const change = changeHighlight(
    'signups-change',
    'Đăng ký mới',
    insights.kpis.newUsers,
    T.newUsersUpPct,
    T.newUsersDownPct,
  );
  if (change) out.push(change);

  const days = completeDays(insights.series.signups, insights.generatedAt);
  const streak = trailingZeroDays(days);
  if (days.length >= T.minDaysForPattern && streak >= T.noSignupDays) {
    out.push({
      id: 'signups-streak',
      level: 'warning',
      text:
        streak === days.length
          ? `Không có đăng ký mới nào trong ${streak} ngày qua`
          : `Không có đăng ký mới trong ${streak} ngày liền`,
    });
  }
  return out;
}

function messageRules(insights: AdminInsights): Highlight[] {
  const series = insights.series.messages;
  if (!series) return [];
  const out: Highlight[] = [];
  const change = changeHighlight(
    'messages-change',
    'Tin nhắn',
    insights.kpis.messages,
    T.messagesPct,
    T.messagesPct,
  );
  if (change) out.push(change);

  // Kỷ lục = ngày đỉnh của kỳ này cao hơn MỌI ngày của kỳ trước, và xảy ra gần đây (không phải kỷ lục từ đầu kỳ đã cũ).
  const previous = insights.previousSeries?.messages;
  const days = completeDays(series, insights.generatedAt);
  const peak = peakOf(days);
  if (previous && peak && days.length >= T.minDaysForPattern && peak.count > 0) {
    const previousMax = Math.max(0, ...previous.map((p) => p.count));
    const recent = days.slice(-T.recentDays).some((p) => p.date === peak.date);
    if (recent && peak.count > previousMax) {
      out.push({
        id: 'messages-record',
        level: 'success',
        text: `Tin nhắn ngày ${formatSeriesDayTick(peak.date)} đạt ${formatNumber(peak.count)}, cao hơn mọi ngày của kỳ trước`,
      });
    }
  }
  return out;
}

function xpRules(insights: AdminInsights): Highlight[] {
  const days = completeDays(insights.series.xp ?? [], insights.generatedAt);
  const peak = peakOf(days);
  if (!peak || days.length < T.minDaysForPattern) return [];
  const othersAvg = (days.reduce((sum, p) => sum + p.count, 0) - peak.count) / (days.length - 1);
  if (othersAvg < T.minAveragePerDay || peak.count < othersAvg * T.xpSpikeRatio) return [];
  return [
    {
      id: 'xp-spike',
      level: 'warning',
      text: `XP ngày ${formatSeriesDayTick(peak.date)} đột biến: ${formatNumber(peak.count)}, gấp ${formatNumber(peak.count / othersAvg, 1)} lần trung bình`,
    },
  ];
}

function callRules(insights: AdminInsights): Highlight[] {
  const change = changeHighlight(
    'calls-change',
    'Cuộc gọi',
    insights.kpis.calls,
    T.callsPct,
    T.callsPct,
  );
  return change ? [change] : [];
}

function overviewRules(overview: AdminOverview, ctx: HighlightContext): Highlight[] {
  const out: Highlight[] = [];
  if (overview.openReports > 0) {
    out.push({
      id: 'open-reports',
      level: overview.openReports >= T.openReportsError ? 'error' : 'warning',
      text: `${formatNumber(overview.openReports)} báo cáo kiểm duyệt đang chờ xử lý`,
      href: ctx.moderationHref,
    });
  }
  const egressFailed = overview.media?.egressFailed24h ?? 0;
  if (egressFailed > 0) {
    out.push({
      id: 'egress-failed',
      level: 'error',
      text: `${formatNumber(egressFailed)} bản ghi hình lỗi (egress) trong 24 giờ qua`,
    });
  }
  return out;
}

/**
 * Các câu "Điều đáng chú ý" suy từ số liệu THẬT — hàm thuần, không gọi API. Tối đa `HIGHLIGHT_MAX` câu, nặng trước (lỗi → cảnh báo → tin tốt →
 * thông tin). Mỗi luật im lặng khi dữ liệu không đủ (chuỗi ngắn, trung bình quá nhỏ…) thay vì bịa ra một nhận xét.
 *
 * `overview` hoặc `insights` vắng (đang tải/lỗi) ⇒ chỉ chạy các luật của phần còn lại; cả hai vắng ⇒ `[]`.
 */
export function deriveHighlights(
  overview: AdminOverview | undefined,
  insights: AdminInsights | undefined,
  ctx: HighlightContext = {},
): Highlight[] {
  const all: Highlight[] = [
    ...(overview ? overviewRules(overview, ctx) : []),
    ...(insights
      ? [
          ...activeUserRules(insights),
          ...signupRules(insights),
          ...xpRules(insights),
          ...messageRules(insights),
          ...callRules(insights),
        ]
      : []),
  ];
  return all.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]).slice(0, HIGHLIGHT_MAX);
}
