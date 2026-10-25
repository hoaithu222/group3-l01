import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import {
  BURNOUT_RULE_AGGREGATES,
  BURNOUT_RULE_METRICS,
  BURNOUT_RULE_OPS,
  REASON_LIMITS,
  RULE_ID_PATTERN,
  RULE_LIMITS,
} from '../constants/wellbeing.constants';

/** Lý do (10–500 ký tự) — khớp `reasonSchema` BE. */
const reasonField = requiredText('Lý do là bắt buộc')
  .min(REASON_LIMITS.min, `Lý do tối thiểu ${REASON_LIMITS.min} ký tự`)
  .max(REASON_LIMITS.max, `Lý do tối đa ${REASON_LIMITS.max} ký tự`);

/**
 * Một luật trong form. `ruleId` (BE gọi là `id`) đổi tên vì `useFieldArray` của RHF dùng khoá `id` cho chính nó. Khớp `burnoutRuleSchema` BE:
 * mã a-z0-9- (≤ 40, do máy chủ/giao diện sinh — admin không gõ), nhãn 1–120, số ngày 1–30, ngưỡng 0–1 000 000 (có thể lẻ, vd trung bình 2,5), điểm nguyên 1–100.
 */
export const burnoutRuleRowSchema = z.object({
  ruleId: z.string().trim().min(1).max(RULE_LIMITS.idMax).regex(RULE_ID_PATTERN),
  label: requiredText('Nhập tên luật').max(
    RULE_LIMITS.labelMax,
    `Tối đa ${RULE_LIMITS.labelMax} ký tự`,
  ),
  metric: z.enum(BURNOUT_RULE_METRICS, { error: 'Chọn chỉ số' }),
  aggregate: z.enum(BURNOUT_RULE_AGGREGATES, { error: 'Chọn cách tổng hợp' }),
  days: z
    .number({ error: 'Nhập số ngày' })
    .int('Số ngày phải là số nguyên')
    .min(1, 'Tối thiểu 1 ngày')
    .max(RULE_LIMITS.windowDaysMax, `Tối đa ${RULE_LIMITS.windowDaysMax} ngày`),
  op: z.enum(BURNOUT_RULE_OPS, { error: 'Chọn phép so sánh' }),
  threshold: z
    .number({ error: 'Nhập ngưỡng' })
    .min(0, 'Ngưỡng không âm')
    .max(RULE_LIMITS.thresholdMax, `Ngưỡng tối đa ${RULE_LIMITS.thresholdMax}`),
  points: z
    .number({ error: 'Nhập điểm' })
    .int('Điểm phải là số nguyên')
    .min(1, 'Tối thiểu 1 điểm')
    .max(RULE_LIMITS.pointsMax, `Tối đa ${RULE_LIMITS.pointsMax} điểm`),
});

/**
 * Form sửa bộ luật (admin.md p7-03 §2.2) — khớp `updateRulesSchema` BE (1–20 luật, cửa sổ 1–30 ngày, `medium` 1–99, `high` 2–100, lý do 10–500) VÀ kiểm chéo mà BE làm ở service
 * để trả `WELL_003`/`WELL_004`: ngưỡng cao PHẢI lớn hơn trung bình (lỗi gắn vào ô "Mức cao"), mã luật không trùng, không luật nào nhìn xa hơn cửa sổ (lỗi gắn vào ô "Số ngày" của luật đó).
 * Chặn ở client cho người dùng thấy lỗi ngay tại ô; BE vẫn là nơi quyết định.
 */
export const burnoutRulesFormSchema = z
  .object({
    windowDays: z
      .number({ error: 'Nhập số ngày của cửa sổ' })
      .int('Số ngày phải là số nguyên')
      .min(1, 'Tối thiểu 1 ngày')
      .max(RULE_LIMITS.windowDaysMax, `Tối đa ${RULE_LIMITS.windowDaysMax} ngày`),
    levels: z.object({
      medium: z
        .number({ error: 'Nhập ngưỡng mức trung bình' })
        .int('Ngưỡng phải là số nguyên')
        .min(1, 'Tối thiểu 1 điểm')
        .max(RULE_LIMITS.mediumMax, `Tối đa ${RULE_LIMITS.mediumMax} điểm`),
      high: z
        .number({ error: 'Nhập ngưỡng mức cao' })
        .int('Ngưỡng phải là số nguyên')
        .min(2, 'Tối thiểu 2 điểm')
        .max(RULE_LIMITS.highMax, `Tối đa ${RULE_LIMITS.highMax} điểm`),
    }),
    rules: z
      .array(burnoutRuleRowSchema)
      .min(1, 'Cần ít nhất 1 luật')
      .max(RULE_LIMITS.rulesMax, `Tối đa ${RULE_LIMITS.rulesMax} luật`),
    reason: reasonField,
  })
  .superRefine((v, ctx) => {
    if (v.levels.medium >= v.levels.high) {
      ctx.addIssue({
        code: 'custom',
        path: ['levels', 'high'],
        message: 'Ngưỡng mức cao phải lớn hơn mức trung bình',
      });
    }
    const seen = new Set<string>();
    v.rules.forEach((rule, index) => {
      if (rule.days > v.windowDays) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', index, 'days'],
          message: `Không được dài hơn cửa sổ ${v.windowDays} ngày`,
        });
      }
      if (seen.has(rule.ruleId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', index, 'label'],
          message: `Mã luật "${rule.ruleId}" bị trùng`,
        });
      }
      seen.add(rule.ruleId);
    });
  });

export type BurnoutRulesFormValues = z.infer<typeof burnoutRulesFormSchema>;
export type BurnoutRuleRow = BurnoutRulesFormValues['rules'][number];
