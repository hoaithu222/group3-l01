/** Cờ tính năng của phân hệ (`capabilities.features`) — tắt thì tab "Sức khoẻ học tập" ẩn khỏi trang Gamification và không gọi API. */
export const WELLBEING_FEATURE_FLAG = 'burnout';

/** Số liệu chưa có / bị che — không bao giờ hiện `0` thay cho "chưa biết" hay "ẩn để khử nhận dạng" (`api-patterns.md`). */
export const NO_DATA = '—';

// ── Nhóm chức năng (URL `?section=`) ─────────────────────────────────────────

export const WELLBEING_SECTION_PARAM = 'section';
export const DEFAULT_WELLBEING_SECTION = 'overview';

export const WELLBEING_SECTIONS = [
  { key: 'overview', label: 'Tổng quan ẩn danh' },
  { key: 'rules', label: 'Bộ luật đánh giá' },
] as const;

/** Đổi nhóm thì xoá bộ lọc của nhóm cũ — khỏi rơi sang nhóm mới với `?weeks=` không thuộc về nó. */
export const CLEAR_SECTION_PARAMS: Record<string, null> = { weeks: null };

// ── Tổng quan ────────────────────────────────────────────────────────────────

export const OVERVIEW_WEEKS_PARAM = 'weeks';
/** `weeks` 1–12 (BE `LIMITS.wellbeing.overviewMaxWeeks`), mặc định 12. */
export const OVERVIEW_DEFAULT_WEEKS = 12;
export const OVERVIEW_WEEK_OPTIONS = [
  { key: '4', label: '4 tuần' },
  { key: '8', label: '8 tuần' },
  { key: '12', label: '12 tuần' },
] as const;

/** Màu series biểu đồ — CHỈ token scale `-5` (`chart-conventions.md §1.2`). */
export const WELLBEING_CHART_COLORS = {
  alerts: 'warning-5',
  LOW: 'success-5',
  MEDIUM: 'warning-5',
  HIGH: 'error-5',
  OTHER: 'indigo-5',
} as const;

/** Chiều cao vùng vẽ — `useChartMetrics` chọn bậc mật độ theo chiều cao THỰC của vùng này. */
export const WELLBEING_CHART_HEIGHT_CLASS = 'h-64';

// ── Bộ luật — khớp `be/src/core/constants/burnout.ts` + `LIMITS.wellbeing` ───

export const BURNOUT_RULE_METRICS = [
  'longestContinuousMinutes',
  'lateNightEvents',
  'lateNightMinutes',
  'activeMinutes',
  'eventsCount',
] as const;
export const BURNOUT_RULE_AGGREGATES = ['MAX', 'SUM', 'AVG', 'CONSECUTIVE_DAYS_OVER'] as const;
export const BURNOUT_RULE_OPS = ['GT', 'GTE'] as const;

export type BurnoutRuleMetric = (typeof BURNOUT_RULE_METRICS)[number];
export type BurnoutRuleAggregate = (typeof BURNOUT_RULE_AGGREGATES)[number];
export type BurnoutRuleOp = (typeof BURNOUT_RULE_OPS)[number];

export const RULE_LIMITS = {
  windowDaysMax: 30,
  rulesMax: 20,
  labelMax: 120,
  idMax: 40,
  thresholdMax: 1_000_000,
  pointsMax: 100,
  /** `levels.medium` 1–99, `levels.high` 2–100 (quan hệ medium < high kiểm chéo). */
  mediumMax: 99,
  highMax: 100,
} as const;

/** Mã luật do máy chủ đặt / giao diện tự sinh cho luật mới — admin không gõ tay. */
export const RULE_ID_PATTERN = /^[a-z0-9-]+$/;

/** Luật mới thêm từ form: nhãn để trống (bắt buộc nhập) nên không thể lưu nhầm một luật chưa nghĩ kỹ. */
export const NEW_RULE_DEFAULTS = {
  metric: 'activeMinutes',
  aggregate: 'AVG',
  days: 7,
  op: 'GT',
  threshold: 60,
  points: 10,
} as const satisfies {
  metric: BurnoutRuleMetric;
  aggregate: BurnoutRuleAggregate;
  days: number;
  op: BurnoutRuleOp;
  threshold: number;
  points: number;
};

export const REASON_LIMITS = { min: 10, max: 500 } as const;

// ── Nhật ký ──────────────────────────────────────────────────────────────────

/** Khớp `targetType`/`action` mà `BurnoutAdminService.updateRules` ghi vào audit log. */
export const BURNOUT_AUDIT_TARGET_TYPE = 'BurnoutRules';
export const BURNOUT_AUDIT_ACTIONS = ['wellbeing.rules-update'] as const;

// ── Nhãn tiếng Việt ──────────────────────────────────────────────────────────

/** Nhãn nhóm mức. `OTHER` = các nhóm quá nhỏ bị gộp lại để khử nhận dạng (k-anonymity) — giải thích ở `LEVEL_OTHER_HINT`. */
export const LEVEL_LABELS = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  OTHER: 'Khác',
} as const;

export const LEVEL_OTHER_HINT =
  'Khác: các nhóm quá nhỏ được gộp lại để không ai có thể bị nhận ra.';

export const METRIC_LABELS: Record<BurnoutRuleMetric, string> = {
  longestContinuousMinutes: 'Phiên làm việc liên tục dài nhất (phút)',
  lateNightEvents: 'Hoạt động vào khuya (số lần)',
  lateNightMinutes: 'Thời gian hoạt động vào khuya (phút)',
  activeMinutes: 'Thời gian hoạt động trong ngày (phút)',
  eventsCount: 'Số hoạt động trong ngày',
};

export const AGGREGATE_LABELS: Record<BurnoutRuleAggregate, string> = {
  MAX: 'Cao nhất trong kỳ',
  SUM: 'Tổng trong kỳ',
  AVG: 'Trung bình mỗi ngày',
  CONSECUTIVE_DAYS_OVER: 'Số ngày liên tiếp vượt ngưỡng',
};

export const OP_LABELS: Record<BurnoutRuleOp, { symbol: string; label: string }> = {
  GT: { symbol: '>', label: 'Lớn hơn' },
  GTE: { symbol: '≥', label: 'Lớn hơn hoặc bằng' },
};

const toOptions = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

export const METRIC_OPTIONS = toOptions(METRIC_LABELS);
export const AGGREGATE_OPTIONS = toOptions(AGGREGATE_LABELS);
export const OP_OPTIONS = BURNOUT_RULE_OPS.map((value) => ({
  value,
  label: `${OP_LABELS[value].label} (${OP_LABELS[value].symbol})`,
}));
