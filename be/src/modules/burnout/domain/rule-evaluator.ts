import { addDaysToLocalDate } from "../../../core/utils/local-date";
import { levelOf, type BurnoutRule, type BurnoutRuleAggregate, type BurnoutRuleMetric, type BurnoutRuleSet, type BurnoutSuggestion, type WellbeingLevel } from "./burnout-rules";
import type { DailyMetrics } from "./wellbeing-day";

/**
 * Bộ chấm điểm THUẦN (p7-03 be.md §5 "Evaluator"): bộ luật + chỉ số các ngày → `riskScore` 0–100 + nhân tố + mức + gợi ý. Không AI (D-13), không I/O, tất định — cùng đầu vào luôn cùng kết quả, không phụ
 * thuộc thứ tự các ngày truyền vào.
 */
export interface WellbeingDay extends DailyMetrics {
  /** Ngày wellbeing `YYYY-MM-DD`. */
  date: string;
}

/**
 * Một luật ĐÃ KÍCH HOẠT. `value` = kết quả tổng hợp (phút/số sự kiện; với `CONSECUTIVE_DAYS_OVER` là SỐ NGÀY liên tiếp vượt ngưỡng). Lưu kèm `label`/`metric` lúc chấm để lịch sử vẫn đọc được sau khi admin sửa luật.
 */
export interface RuleFactor {
  ruleId: string;
  label: string;
  metric: BurnoutRuleMetric;
  aggregate: BurnoutRuleAggregate;
  days: number;
  value: number;
  threshold: number;
  points: number;
}

export interface Evaluation {
  riskScore: number;
  level: WellbeingLevel;
  factors: RuleFactor[];
  suggestion: BurnoutSuggestion | null;
}

const passes = (op: BurnoutRule["op"], value: number, threshold: number): boolean => (op === "GT" ? value > threshold : value >= threshold);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Chấm điểm tính đến ngày wellbeing `asOfDate`. Cửa sổ = `windowDays` ngày lịch kết thúc tại `asOfDate`; luật `MAX/SUM/AVG` xét `min(days, windowDays)` ngày gần nhất và chỉ dùng NGÀY CÓ DỮ LIỆU (ngày trước
 * khi bật theo dõi hoặc job lỡ nhịp là "không biết", KHÔNG phải "0 phút") — không có ngày nào → luật không kích hoạt. `CONSECUTIVE_DAYS_OVER` đếm số ngày liên tiếp GẦN NHẤT (từ `asOfDate` lùi) có dữ liệu và
 * vượt ngưỡng; một ngày thiếu hoặc không vượt làm đứt chuỗi; kích hoạt khi chuỗi ≥ `days`.
 */
export function evaluateRules(ruleSet: BurnoutRuleSet, days: readonly WellbeingDay[], asOfDate: string): Evaluation {
  const byDate = new Map<string, WellbeingDay>();
  for (const day of days) byDate.set(day.date, day);

  const recent = (count: number): WellbeingDay[] => {
    const out: WellbeingDay[] = [];
    for (let i = 0; i < count; i += 1) {
      const day = byDate.get(addDaysToLocalDate(asOfDate, -i));
      if (day) out.push(day);
    }
    return out;
  };

  const factors: RuleFactor[] = [];
  for (const rule of ruleSet.rules) {
    const value = aggregate(rule, ruleSet.windowDays, recent, byDate, asOfDate);
    if (value === null) continue;
    const triggered = rule.aggregate === "CONSECUTIVE_DAYS_OVER" ? value >= rule.days : passes(rule.op, value, rule.threshold);
    if (!triggered) continue;
    factors.push({ ruleId: rule.id, label: rule.label, metric: rule.metric, aggregate: rule.aggregate, days: rule.days, value, threshold: rule.threshold, points: rule.points });
  }

  const riskScore = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  return { riskScore, level: levelOf(riskScore, ruleSet.levels), factors, suggestion: suggestionOf(factors) };
}

/** `null` = luật không áp dụng được (chưa có ngày nào có dữ liệu). */
function aggregate(rule: BurnoutRule, windowDays: number, recent: (n: number) => WellbeingDay[], byDate: Map<string, WellbeingDay>, asOfDate: string): number | null {
  if (rule.aggregate === "CONSECUTIVE_DAYS_OVER") {
    let run = 0;
    for (let i = 0; i < windowDays; i += 1) {
      const day = byDate.get(addDaysToLocalDate(asOfDate, -i));
      if (!day || !passes(rule.op, day[rule.metric], rule.threshold)) break;
      run += 1;
    }
    return run;
  }
  const values = recent(Math.min(rule.days, windowDays)).map((d) => d[rule.metric]);
  if (values.length === 0) return null;
  if (rule.aggregate === "MAX") return Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  return rule.aggregate === "SUM" ? sum : round1(sum / values.length);
}

/**
 * Gợi ý theo nhân tố NẶNG NHẤT (điểm cao nhất, hoà → luật đứng trước): khuya → ngủ sớm (`SLEEP`), làm liên tục → nghỉ giải lao (`BREAK`), hoạt động dày → giãn tiến độ (`SPREAD_TASKS`). Không có nhân tố → `null`.
 */
export function suggestionOf(factors: readonly Pick<RuleFactor, "metric" | "points">[]): BurnoutSuggestion | null {
  let top: Pick<RuleFactor, "metric" | "points"> | null = null;
  for (const f of factors) if (top === null || f.points > top.points) top = f;
  if (top === null) return null;
  if (top.metric === "lateNightEvents" || top.metric === "lateNightMinutes") return "SLEEP";
  if (top.metric === "longestContinuousMinutes") return "BREAK";
  return "SPREAD_TASKS";
}
