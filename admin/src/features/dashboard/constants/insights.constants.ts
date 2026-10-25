/**
 * Hằng số phần "phân tích" của trang Tổng quan — nhãn khoảng thời gian, nhãn/màu chỉ số, ngưỡng của câu nhận xét tự động.
 * Màu series CHỈ token scale `-5` (`chart-conventions.md §1.2`).
 */
import type { InsightsKpis, InsightsRange, InsightsSeries } from '@/core/api/admin';
import type { BoldSystemIconName, GemColor } from '@/shared/ui';

import type { DeltaGoodWhen, InsightKpiId, TrendMetricKey } from '../types/insights.types';

// ── Khoảng thời gian ──────────────────────────────────────────────────────────

/** Khoá URL của khoảng thời gian: `?range=7d|90d`. Mặc định (`30d`) thì BỎ khỏi URL cho gọn. */
export const INSIGHTS_RANGE_PARAM = 'range';
export const INSIGHTS_DEFAULT_RANGE: InsightsRange = '30d';

export const INSIGHTS_RANGE_OPTIONS: { key: InsightsRange; label: string }[] = [
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: '90d', label: '90 ngày' },
];

// ── Màu series ────────────────────────────────────────────────────────────────

/**
 * Mỗi chỉ số MỘT màu, dùng chung cho sparkline của thẻ KPI và biểu đồ xu hướng — cùng một chỉ số ở hai nơi phải cùng màu.
 *
 * Cố ý KHÔNG dùng `success`/`warning`/`error`/`info`: đó là màu TRẠNG THÁI ("ổn / cảnh báo / lỗi"), đặt lên chuỗi đếm thuần làm người đọc tưởng
 * biểu đồ đang báo tình trạng. `secondary-5` (cyan) là slot đầu của `CHART_SERIES_TOKENS`, các màu sau lấy theo thứ tự dải đã kiểm mù màu.
 */
export const INSIGHT_SERIES_COLORS = {
  activeUsers: 'secondary-5',
  signups: 'indigo-5',
  messages: 'pink-5',
  calls: 'teal-5',
  callMinutes: 'teal-5',
  xp: 'accent-5',
} as const;

/** Chrome của biểu đồ xu hướng: nét kỳ trước (xám, đứt) — là CHROME chứ không phải series nên dùng `fg-4` (`chart-conventions.md §1.2` ngoại lệ). */
export const INSIGHT_PREVIOUS_TOKEN = 'fg-4';

// ── Chỉ số vẽ trên biểu đồ xu hướng ───────────────────────────────────────────

/** Khoá KPI (ở `InsightsKpis`) có số tổng kỳ của từng chỉ số — để hiện ▲▼ cạnh biểu đồ. */
type MetricKpiKey = Exclude<keyof InsightsKpis, 'totalUsers' | 'badgesUnlocked'>;

export interface TrendMetricSpec {
  /** Nhãn đầy đủ (tooltip, `aria-label`). */
  label: string;
  /** Nhãn ngắn trên bộ chọn. */
  shortLabel: string;
  /** Đơn vị đứng sau số ở tooltip. */
  unit: string;
  token: string;
  kpi: MetricKpiKey;
}

export const TREND_METRICS: Record<TrendMetricKey, TrendMetricSpec> = {
  activeUsers: {
    label: 'Người dùng hoạt động',
    shortLabel: 'Hoạt động',
    unit: 'người',
    token: INSIGHT_SERIES_COLORS.activeUsers,
    kpi: 'activeUsers',
  },
  signups: {
    label: 'Đăng ký mới',
    shortLabel: 'Đăng ký mới',
    unit: 'người',
    token: INSIGHT_SERIES_COLORS.signups,
    kpi: 'newUsers',
  },
  messages: {
    label: 'Tin nhắn',
    shortLabel: 'Tin nhắn',
    unit: 'tin nhắn',
    token: INSIGHT_SERIES_COLORS.messages,
    kpi: 'messages',
  },
  callMinutes: {
    label: 'Phút gọi',
    shortLabel: 'Phút gọi',
    unit: 'phút',
    token: INSIGHT_SERIES_COLORS.callMinutes,
    kpi: 'callMinutes',
  },
  xp: {
    label: 'XP đã cấp',
    shortLabel: 'XP',
    unit: 'XP',
    token: INSIGHT_SERIES_COLORS.xp,
    kpi: 'xpAwarded',
  },
};

/** Thứ tự hiện trên bộ chọn — chỉ số nào BE không trả chuỗi thì bị lọc bỏ (xem `availableTrendMetrics`). */
export const TREND_METRIC_ORDER: readonly TrendMetricKey[] = [
  'activeUsers',
  'signups',
  'messages',
  'callMinutes',
  'xp',
];

// ── Thẻ KPI có so sánh kỳ trước ───────────────────────────────────────────────

export interface InsightKpiSpec {
  id: InsightKpiId;
  label: string;
  icon: BoldSystemIconName;
  /** Màu skin của thẻ (kit chỉ có 5 màu) — KHÔNG phải màu series. */
  gem: GemColor;
  /** Màu sparkline. */
  token: string;
  kpi: Exclude<MetricKpiKey, 'callMinutes'>;
  series: keyof Pick<InsightsSeries, 'signups' | 'activeUsers' | 'messages' | 'calls' | 'xp'>;
  /** Cờ phân hệ — bật MỘT trong các cờ là đủ; rỗng = luôn có. Cờ TẮT (`false`) ⇒ ẩn thẻ. */
  flags: readonly string[];
  goodWhen: DeltaGoodWhen;
}

/** Thứ tự = thứ tự hiện trên dải. Cả 5 chỉ số đều "tốt khi tăng" (mức dùng): đăng ký mới tăng KHÔNG được tô đỏ. */
export const INSIGHT_KPI_SPECS: readonly InsightKpiSpec[] = [
  {
    id: 'newUsers',
    label: 'Người dùng mới',
    icon: 'user-plus-bold',
    gem: 'blue',
    token: INSIGHT_SERIES_COLORS.signups,
    kpi: 'newUsers',
    series: 'signups',
    flags: [],
    goodWhen: 'up',
  },
  {
    id: 'activeUsers',
    label: 'Người dùng hoạt động',
    icon: 'users-bold',
    gem: 'blue',
    token: INSIGHT_SERIES_COLORS.activeUsers,
    kpi: 'activeUsers',
    series: 'activeUsers',
    flags: [],
    goodWhen: 'up',
  },
  {
    id: 'messages',
    label: 'Tin nhắn',
    icon: 'message-bold',
    gem: 'blue',
    token: INSIGHT_SERIES_COLORS.messages,
    kpi: 'messages',
    series: 'messages',
    flags: ['communication'],
    goodWhen: 'up',
  },
  {
    id: 'calls',
    label: 'Cuộc gọi',
    icon: 'phone-bold',
    gem: 'green',
    token: INSIGHT_SERIES_COLORS.calls,
    kpi: 'calls',
    series: 'calls',
    flags: ['voice', 'meeting'],
    goodWhen: 'up',
  },
  {
    id: 'xp',
    label: 'XP đã cấp',
    icon: 'star-bold',
    gem: 'yellow',
    token: INSIGHT_SERIES_COLORS.xp,
    kpi: 'xpAwarded',
    series: 'xp',
    flags: ['gamification'],
    goodWhen: 'up',
  },
];

// ── Câu nhận xét tự động ──────────────────────────────────────────────────────

/** Tối đa bao nhiêu chip "Điều đáng chú ý" — nhiều hơn là hết "đáng chú ý". */
export const HIGHLIGHT_MAX = 6;

/**
 * Ngưỡng của từng luật nhận xét. Số `*Pct` là PHẦN TRĂM (thang 100). Đặt ở đây để chỉnh độ "nhạy" một chỗ; ngưỡng GIẢM thấp hơn/cao hơn ngưỡng TĂNG
 * có chủ ý — sụt là thứ cần biết sớm, tăng chỉ đáng kể khi đủ lớn.
 */
export const HIGHLIGHT_THRESHOLDS = {
  activeUsersUpPct: 5,
  activeUsersDownPct: 10,
  newUsersUpPct: 10,
  newUsersDownPct: 20,
  messagesPct: 15,
  callsPct: 25,
  /** Ngày hôm qua thấp hơn trung bình các ngày trước quá ngưỡng này ⇒ cảnh báo. */
  yesterdayBelowAvgPct: 30,
  /** Số ngày liền không có đăng ký mới tối thiểu để báo. */
  noSignupDays: 3,
  /** Chuỗi ngắn hơn số ngày này thì không đủ để nói chuyện "bất thường". */
  minDaysForPattern: 7,
  /** Trung bình/ngày nhỏ hơn mức này thì phần trăm chỉ là nhiễu (3 → 2 người là −33%). */
  minAveragePerDay: 10,
  /** Ngày thấp nhất chỉ bằng chừng này % trung bình mới đáng nhắc. */
  lowDayPctOfAverage: 50,
  /** "Gần đây" = trong N ngày trọn vẹn cuối kỳ (cho luật kỷ lục). */
  recentDays: 3,
  /** XP một ngày gấp chừng này lần trung bình các ngày còn lại ⇒ đột biến. */
  xpSpikeRatio: 3,
  /** Báo cáo chờ xử lý từ mức này trở lên ⇒ chip đỏ thay vì vàng. */
  openReportsError: 20,
} as const;
