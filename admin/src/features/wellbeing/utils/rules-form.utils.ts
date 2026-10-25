import { NEW_RULE_DEFAULTS, RULE_LIMITS } from '../constants/wellbeing.constants';
import type { BurnoutRuleRow, BurnoutRulesFormValues } from '../schemas/burnout-rules.schema';
import type { BurnoutRule, BurnoutRules, PutBurnoutRulesPayload } from '../types/wellbeing.types';

const ruleToRow = (rule: BurnoutRule): BurnoutRuleRow => ({
  ruleId: rule.id,
  label: rule.label,
  metric: rule.metric,
  aggregate: rule.aggregate,
  days: rule.days,
  op: rule.op,
  threshold: rule.threshold,
  points: rule.points,
});

const rowToRule = (row: BurnoutRuleRow): BurnoutRule => ({
  id: row.ruleId,
  label: row.label,
  metric: row.metric,
  aggregate: row.aggregate,
  days: row.days,
  op: row.op,
  threshold: row.threshold,
  points: row.points,
});

/** Giá trị đầu của form từ bộ luật đang lưu (lý do để trống — luôn phải nhập lại cho lần lưu này). */
export const rulesToFormValues = (rules: BurnoutRules): BurnoutRulesFormValues => ({
  windowDays: rules.windowDays,
  levels: { medium: rules.levels.medium, high: rules.levels.high },
  rules: rules.rules.map(ruleToRow),
  reason: '',
});

/**
 * Nút "Về mặc định" (admin.md p7-03 §2.2) — điền form bằng bộ luật mặc định BE trả kèm (`rules.defaults`), KHÔNG chép hằng số sang admin
 * để khỏi lệch âm thầm nếu mặc định đổi. Lý do vẫn để trống — người sửa PHẢI tự gõ lý do rồi mới lưu được (đây chỉ điền sẵn ô, không tự lưu).
 */
export const defaultsToFormValues = (rules: BurnoutRules): BurnoutRulesFormValues => ({
  windowDays: rules.defaults.windowDays,
  levels: { medium: rules.defaults.levels.medium, high: rules.defaults.levels.high },
  rules: rules.defaults.rules.map(ruleToRow),
  reason: '',
});

/** Thân PUT: bộ luật + `expectedVersion` (= `version` bộ luật lúc MỞ form) + lý do. BE dùng `.strict()` nên chỉ gửi đúng các khoá này. */
export const toPutPayload = (
  values: BurnoutRulesFormValues,
  expectedVersion: number,
): PutBurnoutRulesPayload => ({
  windowDays: values.windowDays,
  levels: { medium: values.levels.medium, high: values.levels.high },
  rules: values.rules.map(rowToRule),
  expectedVersion,
  reason: values.reason,
});

/** Chuỗi so sánh ổn định của phần BỘ LUẬT (không tính lý do) — thứ tự luật có nghĩa (hiển thị + nhật ký). */
const fingerprint = (v: Pick<BurnoutRulesFormValues, 'windowDays' | 'levels' | 'rules'>): string =>
  JSON.stringify([v.windowDays, v.levels.medium, v.levels.high, v.rules.map((r) => rowToRule(r))]);

/** Form đã khác bản đang lưu chưa — chưa đổi gì thì không cho lưu (khỏi tạo phiên bản + dòng nhật ký rỗng nghĩa). */
export const hasRulesChanges = (base: BurnoutRules, values: BurnoutRulesFormValues): boolean =>
  fingerprint(rulesToFormValues(base)) !== fingerprint(values);

/** Mã cho luật mới: `custom-1`, `custom-2`… nhỏ nhất chưa dùng. Khớp `^[a-z0-9-]+$`, ≤ 40 ký tự. */
export function nextRuleId(existing: readonly string[]): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`custom-${n}`)) n += 1;
  return `custom-${n}`;
}

/** Hàng luật trống cho nút "Thêm luật"; số ngày không vượt cửa sổ hiện tại. */
export const newRuleRow = (existingIds: readonly string[], windowDays: number): BurnoutRuleRow => ({
  ruleId: nextRuleId(existingIds),
  label: '',
  ...NEW_RULE_DEFAULTS,
  days: Math.max(
    1,
    Math.min(
      NEW_RULE_DEFAULTS.days,
      Number.isFinite(windowDays) ? windowDays : NEW_RULE_DEFAULTS.days,
    ),
  ),
});

/** Còn chỗ thêm luật không (trần BE 20). */
export const canAddRule = (count: number): boolean => count < RULE_LIMITS.rulesMax;
