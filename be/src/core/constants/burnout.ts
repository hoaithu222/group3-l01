import { z } from "zod";
import { LIMITS } from "./limits";

/**
 * Bộ luật chấm điểm "burnout radar" (p7-03) — NGUỒN DUY NHẤT dùng chung cho registry `SystemConfig` (`burnout.rules`), DTO admin và domain thuần của `modules/burnout`
 * (core không import module nên hằng/schema ở đây; giống `constants/contribution.ts`). Khoá 2 đoạn vì registry chỉ nhận khoá 1–2 đoạn.
 *
 * Không có AI (D-13): chỉ luật "điều kiện trên cửa sổ N ngày → cộng điểm", `riskScore = min(100, Σ điểm)`. Chỉ số ngày (`metric`) do job tổng hợp từ khe 15 phút có hoạt động, KHÔNG có nội dung.
 */
export const BURNOUT_RULES_CONFIG_KEY = "burnout.rules";

export const BURNOUT_RULE_METRICS = ["longestContinuousMinutes", "lateNightEvents", "lateNightMinutes", "activeMinutes", "eventsCount"] as const;
export type BurnoutRuleMetric = (typeof BURNOUT_RULE_METRICS)[number];

/** `CONSECUTIVE_DAYS_OVER`: số ngày LIÊN TIẾP gần nhất mà chỉ số vượt ngưỡng ≥ `days`; ba loại còn lại tính trên `days` ngày gần nhất. */
export const BURNOUT_RULE_AGGREGATES = ["MAX", "SUM", "AVG", "CONSECUTIVE_DAYS_OVER"] as const;
export type BurnoutRuleAggregate = (typeof BURNOUT_RULE_AGGREGATES)[number];

export const BURNOUT_RULE_OPS = ["GT", "GTE"] as const;
export type BurnoutRuleOp = (typeof BURNOUT_RULE_OPS)[number];

export const burnoutRuleSchema = z
  .object({
    id: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, "Mã luật chỉ gồm chữ thường, số và dấu gạch ngang"),
    label: z.string().trim().min(1).max(LIMITS.wellbeing.ruleLabelMax),
    metric: z.enum(BURNOUT_RULE_METRICS),
    aggregate: z.enum(BURNOUT_RULE_AGGREGATES),
    days: z.number().int().min(1).max(LIMITS.wellbeing.windowDaysMax),
    op: z.enum(BURNOUT_RULE_OPS),
    threshold: z.number().finite().min(0).max(1_000_000),
    points: z.number().int().min(1).max(100),
  })
  .strict();
export type BurnoutRuleConfig = z.infer<typeof burnoutRuleSchema>;

/** `version` do máy chủ gán (tăng 1 mỗi lần admin lưu) — client KHÔNG tự đặt; assessment lưu lại `ruleVersion`. Ràng buộc chéo (medium < high, id duy nhất, days ≤ windowDays) kiểm ở domain. */
export const burnoutRuleSetSchema = z
  .object({
    version: z.number().int().min(1).max(1_000_000),
    windowDays: z.number().int().min(1).max(LIMITS.wellbeing.windowDaysMax),
    levels: z.object({ medium: z.number().int().min(1).max(99), high: z.number().int().min(2).max(100) }).strict(),
    rules: z.array(burnoutRuleSchema).min(1).max(LIMITS.wellbeing.rulesMax),
  })
  .strict();
export type BurnoutRuleSetConfig = z.infer<typeof burnoutRuleSetSchema>;

/**
 * Bộ luật mặc định theo đặc tả (p7-03 README §7) — ĐÚNG bốn luật, tổng điểm tối đa 100:
 *  1. làm liên tục > 180 phút (ngày dài nhất trong 7 ngày) +30;  2. hoạt động khuya > 2 lần trong 7 ngày +30;
 *  3. trung bình > 600 phút hoạt động mỗi ngày trong 7 ngày +20;  4. 3 ngày liên tiếp có > 60 phút hoạt động khuya +20.
 */
export const DEFAULT_BURNOUT_RULE_SET: BurnoutRuleSetConfig = {
  version: 1,
  windowDays: 7,
  levels: { medium: 40, high: 70 },
  rules: [
    { id: "long-continuous-session", label: "Làm việc liên tục quá lâu", metric: "longestContinuousMinutes", aggregate: "MAX", days: 7, op: "GT", threshold: 180, points: 30 },
    { id: "late-night-events", label: "Hoạt động vào khuya nhiều lần", metric: "lateNightEvents", aggregate: "SUM", days: 7, op: "GT", threshold: 2, points: 30 },
    { id: "high-daily-activity", label: "Thời gian hoạt động mỗi ngày cao", metric: "activeMinutes", aggregate: "AVG", days: 7, op: "GT", threshold: 600, points: 20 },
    { id: "late-night-streak", label: "Nhiều ngày liền hoạt động khuya", metric: "lateNightMinutes", aggregate: "CONSECUTIVE_DAYS_OVER", days: 3, op: "GT", threshold: 60, points: 20 },
  ],
};
