import {
  DEFAULT_BURNOUT_RULE_SET,
  burnoutRuleSetSchema,
  type BurnoutRuleAggregate,
  type BurnoutRuleConfig,
  type BurnoutRuleMetric,
  type BurnoutRuleOp,
  type BurnoutRuleSetConfig,
} from "../../../core/constants/burnout";

/**
 * Kiểu + kiểm tra ràng buộc của BỘ LUẬT chấm điểm (p7-03) — HÀM THUẦN, không I/O. Hình dạng (kiểu dữ liệu, khoảng giá trị) do `burnoutRuleSetSchema` (core) kiểm; file này kiểm phần
 * schema không diễn đạt được (ràng buộc chéo) và đọc bộ luật đã lưu một cách "không bao giờ ném lỗi": lưu hỏng ⇒ dùng bộ luật mặc định theo đặc tả, không làm hỏng job chấm điểm.
 */
export type BurnoutRule = BurnoutRuleConfig;
export type BurnoutRuleSet = BurnoutRuleSetConfig;
export type { BurnoutRuleAggregate, BurnoutRuleMetric, BurnoutRuleOp };

export type WellbeingLevel = "LOW" | "MEDIUM" | "HIGH";
export type BurnoutSuggestion = "BREAK" | "SPREAD_TASKS" | "SLEEP";

/** LOW < `medium` ≤ MEDIUM < `high` ≤ HIGH (README §2). */
export function levelOf(score: number, levels: { medium: number; high: number }): WellbeingLevel {
  if (score >= levels.high) return "HIGH";
  if (score >= levels.medium) return "MEDIUM";
  return "LOW";
}

export type RuleSetIssueCode = "LEVELS_ORDER" | "DUPLICATE_RULE_ID" | "RULE_DAYS_EXCEED_WINDOW";

export interface RuleSetIssue {
  code: RuleSetIssueCode;
  message: string;
  ruleId?: string;
}

/**
 * Ràng buộc chéo của bộ luật (danh sách rỗng = hợp lệ): `levels.medium < levels.high` (service → `WELL_004`), mã luật duy nhất, và không luật nào nhìn xa hơn cửa sổ (`days ≤ windowDays` — luật
 * `CONSECUTIVE_DAYS_OVER` đòi chuỗi dài hơn cửa sổ thì KHÔNG BAO GIỜ đạt; các luật còn lại sẽ bị cắt ngầm). Hai loại sau → `WELL_003`.
 */
export function checkRuleSet(set: Pick<BurnoutRuleSet, "windowDays" | "levels" | "rules">): RuleSetIssue[] {
  const issues: RuleSetIssue[] = [];
  if (set.levels.medium >= set.levels.high) issues.push({ code: "LEVELS_ORDER", message: "Ngưỡng mức cao phải lớn hơn ngưỡng mức trung bình" });
  const seen = new Set<string>();
  for (const rule of set.rules) {
    if (seen.has(rule.id)) issues.push({ code: "DUPLICATE_RULE_ID", message: `Mã luật "${rule.id}" bị trùng`, ruleId: rule.id });
    seen.add(rule.id);
    if (rule.days > set.windowDays) issues.push({ code: "RULE_DAYS_EXCEED_WINDOW", message: `Luật "${rule.id}" nhìn ${String(rule.days)} ngày, dài hơn cửa sổ ${String(set.windowDays)} ngày`, ruleId: rule.id });
  }
  return issues;
}

export interface ParsedRuleSet {
  ruleSet: BurnoutRuleSet;
  /** `true` khi giá trị lưu không đọc được/không hợp lệ nên phải dùng mặc định. */
  usedDefault: boolean;
}

/** Đọc bộ luật từ giá trị thô (đã gộp mặc định ở `runtimeConfig`): đúng hình dạng VÀ qua `checkRuleSet` mới dùng, ngược lại về mặc định. */
export function parseRuleSet(raw: unknown): ParsedRuleSet {
  const parsed = burnoutRuleSetSchema.safeParse(raw);
  if (parsed.success && checkRuleSet(parsed.data).length === 0) return { ruleSet: parsed.data, usedDefault: false };
  return { ruleSet: DEFAULT_BURNOUT_RULE_SET, usedDefault: true };
}

export { DEFAULT_BURNOUT_RULE_SET };
