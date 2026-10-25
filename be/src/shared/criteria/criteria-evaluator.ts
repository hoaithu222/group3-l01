import { z } from "zod";
import { LIMITS } from "../../core/constants/limits";

/**
 * Đánh giá điều kiện mở huy hiệu trên BỘ ĐẾM (p4-03 README §2) — HÀM THUẦN, dùng lại cho huy hiệu kỹ năng p6-06.
 * `criteria = { all: [{ counter, op: gte, value }], any?: [...] }`: mở khi MỌI mệnh đề `all` đạt VÀ (không có `any` hoặc ít nhất một
 * mệnh đề `any` đạt). Counter thuộc WHITELIST — KHÔNG có giờ khuya/online (cổng ra Phase 4 #3).
 */
export const COUNTER_KEYS = [
  "tasksDone",
  "tasksOnTime",
  "quizzesTaken",
  "quizzesPassed",
  "quizHighScores",
  "srReviews",
  "srReviewDays",
  "reviewsGiven",
  "setsPublished",
  "longestStreak",
  "level",
] as const;
export type CounterKey = (typeof COUNTER_KEYS)[number];
export type CounterValues = Partial<Record<CounterKey, number>>;

const clauseSchema = z.object({
  counter: z.enum(COUNTER_KEYS),
  op: z.enum(["gte"]).default("gte"),
  value: z.number().int().min(1).max(1_000_000),
});
export type CriteriaClause = z.infer<typeof clauseSchema>;

export const criteriaSchema = z
  .object({
    all: z.array(clauseSchema).min(1).max(LIMITS.badge.criteriaClausesMax),
    any: z.array(clauseSchema).max(LIMITS.badge.criteriaClausesMax).optional(),
  })
  .strict();
export type Criteria = z.infer<typeof criteriaSchema>;

const satisfied = (c: CriteriaClause, counters: CounterValues): boolean => (counters[c.counter] ?? 0) >= c.value;

export function evaluateCriteria(criteria: Criteria, counters: CounterValues): boolean {
  if (!criteria.all.every((c) => satisfied(c, counters))) return false;
  const any = criteria.any ?? [];
  return any.length === 0 || any.some((c) => satisfied(c, counters));
}

/** Các counter mà criteria dùng (không trùng) — lưu ở `Badge.counters` để chỉ đánh giá badge có counter vừa đổi. */
export function criteriaCounters(criteria: Criteria): CounterKey[] {
  return [...new Set([...criteria.all, ...(criteria.any ?? [])].map((c) => c.counter))];
}

export interface CriteriaProgress {
  counter: CounterKey;
  current: number;
  target: number;
}

/**
 * (p6-06) Ngưỡng tổng quát `current ≥ min` — lõi dùng chung giữa bộ đếm của huy hiệu gamification (ở trên) và tiêu chí kỹ năng
 * (`skill-criteria.ts`: số task, story points, điểm review TB, số task đã qua chấm). `min = null` = không áp dụng (luôn đạt).
 */
export interface Threshold {
  key: string;
  current: number;
  min: number | null;
}

export function meetsThresholds(thresholds: readonly Threshold[]): boolean {
  return thresholds.every((t) => t.min === null || t.current >= t.min);
}

/** Phần còn thiếu của từng ngưỡng (≥ 0) — tracker "còn 12 task". Ngưỡng không áp dụng → 0. */
export function thresholdGaps(thresholds: readonly Threshold[]): Record<string, number> {
  return Object.fromEntries(thresholds.map((t) => [t.key, t.min === null ? 0 : Math.max(0, t.min - t.current)]));
}

/** Tiến độ từng mệnh đề (`all` rồi `any`) — hiển thị "đã đạt 30/50" ở danh mục huy hiệu. `current` kẹp ở `target`. */
export function criteriaProgress(criteria: Criteria, counters: CounterValues): CriteriaProgress[] {
  return [...criteria.all, ...(criteria.any ?? [])].map((c) => ({ counter: c.counter, current: Math.min(counters[c.counter] ?? 0, c.value), target: c.value }));
}
