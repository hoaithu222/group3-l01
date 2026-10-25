/**
 * Phần thuần của phân hệ `wellbeing` (p7-03 admin.md §4): schema form bộ luật khớp `updateRulesSchema` BE + kiểm chéo (`WELL_003`/`WELL_004`), dựng thân PUT (đúng các khoá BE `.strict()` cho phép),
 * mã luật mới, so sánh "đã sửa chưa", định dạng số ẩn danh, đọc lỗi BE gắn vào ô.
 */
import { AxiosError, type AxiosResponse } from 'axios';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { RULE_LIMITS } from '@/features/wellbeing/constants/wellbeing.constants';
import {
  burnoutRulesFormSchema,
  type BurnoutRulesFormValues,
} from '@/features/wellbeing/schemas/burnout-rules.schema';
import {
  formatAlertCount,
  formatApprox,
  hasAlerts,
  hasSuppressedCell,
  parseOverviewWeeks,
  toLevelRows,
} from '@/features/wellbeing/utils/overview.utils';
import {
  hasRulesChanges,
  newRuleRow,
  nextRuleId,
  rulesToFormValues,
  toPutPayload,
} from '@/features/wellbeing/utils/rules-form.utils';
import {
  applyRulesServerErrors,
  isVersionConflict,
} from '@/features/wellbeing/utils/wellbeing-errors';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { auditActionLabel, auditTargetTypeLabel } from '@/shared/constants/audit-actions';

import { makeRules } from './wellbeing-fixtures';

const REASON = 'Điều chỉnh ngưỡng theo phản hồi';
const validValues = (over: Partial<BurnoutRulesFormValues> = {}): BurnoutRulesFormValues => ({
  ...rulesToFormValues(makeRules()),
  reason: REASON,
  ...over,
});

const issuesOf = (values: unknown) => {
  const parsed = burnoutRulesFormSchema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};
const pathsOf = (values: unknown) => issuesOf(values).map((i) => i.path);

function axiosError(status: number, code: string, message: string, details?: unknown): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: {},
    data: { success: false, error: { code, message, details } },
  } as unknown as AxiosResponse;
  return new AxiosError(message, code, undefined, undefined, response);
}

describe('burnoutRulesFormSchema — khớp updateRulesSchema BE', () => {
  it('bộ luật mặc định + lý do hợp lệ', () => {
    expect(issuesOf(validValues())).toEqual([]);
  });

  it('WELL_004: Cao ≤ Trung bình bị chặn ở ô Mức cao (cả bằng nhau lẫn nhỏ hơn); Cao > Trung bình thì qua', () => {
    for (const levels of [
      { medium: 60, high: 60 },
      { medium: 60, high: 50 },
    ]) {
      expect(issuesOf(validValues({ levels }))).toEqual([
        { path: 'levels.high', message: 'Ngưỡng mức cao phải lớn hơn mức trung bình' },
      ]);
    }
    expect(issuesOf(validValues({ levels: { medium: 60, high: 61 } }))).toEqual([]);
  });

  it('khoảng giá trị: cửa sổ 1–30, medium 1–99, high 2–100', () => {
    expect(pathsOf(validValues({ windowDays: 0 }))).toContain('windowDays');
    expect(pathsOf(validValues({ windowDays: 31 }))).toContain('windowDays');
    expect(pathsOf(validValues({ levels: { medium: 0, high: 70 } }))).toContain('levels.medium');
    expect(pathsOf(validValues({ levels: { medium: 100, high: 100 } }))).toContain('levels.medium');
    expect(pathsOf(validValues({ levels: { medium: 1, high: 1 } }))).toContain('levels.high');
    expect(pathsOf(validValues({ levels: { medium: 40, high: 101 } }))).toContain('levels.high');
  });

  it('WELL_003: luật nhìn xa hơn cửa sổ bị chặn ở ô Số ngày của đúng luật đó', () => {
    const values = validValues({ windowDays: 5 });
    // 3 luật đầu nhìn 7 ngày > 5; luật 4 nhìn 3 ngày thì ổn.
    expect(
      pathsOf(values)
        .filter((p) => p.endsWith('.days'))
        .sort(),
    ).toEqual(['rules.0.days', 'rules.1.days', 'rules.2.days']);
  });

  it('WELL_003: mã luật trùng bị chặn', () => {
    const base = validValues();
    const rules = [base.rules[0], { ...base.rules[1], ruleId: base.rules[0].ruleId }];
    expect(issuesOf({ ...base, rules })).toEqual([
      { path: 'rules.1.label', message: `Mã luật "${base.rules[0].ruleId}" bị trùng` },
    ]);
  });

  it('1–20 luật', () => {
    const base = validValues();
    expect(pathsOf({ ...base, rules: [] })).toContain('rules');
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...base.rules[0], ruleId: `r${i}` }));
    expect(issuesOf({ ...base, rules: many(RULE_LIMITS.rulesMax) })).toEqual([]);
    expect(pathsOf({ ...base, rules: many(RULE_LIMITS.rulesMax + 1) })).toContain('rules');
  });

  it('từng luật: nhãn không trắng/≤ 120, ngày 1–30, ngưỡng 0–1 000 000 (lẻ được), điểm nguyên 1–100, mã đúng khuôn', () => {
    const base = validValues();
    const withRule = (patch: Record<string, unknown>) =>
      issuesOf({ ...base, rules: [{ ...base.rules[0], ...patch }] });
    expect(withRule({ threshold: 2.5 })).toEqual([]);
    expect(withRule({ label: '   ' })).not.toEqual([]);
    expect(withRule({ label: 'x'.repeat(121) })).not.toEqual([]);
    expect(withRule({ days: 0 })).not.toEqual([]);
    expect(withRule({ days: 31 })).not.toEqual([]);
    expect(withRule({ days: 1.5 })).not.toEqual([]);
    expect(withRule({ threshold: -1 })).not.toEqual([]);
    expect(withRule({ threshold: 1_000_001 })).not.toEqual([]);
    expect(withRule({ points: 0 })).not.toEqual([]);
    expect(withRule({ points: 101 })).not.toEqual([]);
    expect(withRule({ points: 1.5 })).not.toEqual([]);
    expect(withRule({ metric: 'bedtime' })).not.toEqual([]);
    expect(withRule({ aggregate: 'MEDIAN' })).not.toEqual([]);
    expect(withRule({ op: 'LT' })).not.toEqual([]);
    expect(withRule({ ruleId: 'Có Dấu' })).not.toEqual([]);
  });

  it('ô số để trống (null) → thông điệp tiếng Việt, không lộ "expected number"', () => {
    const base = validValues();
    const messages = issuesOf({
      ...base,
      windowDays: null,
      levels: { medium: null, high: null },
      rules: [{ ...base.rules[0], days: null, threshold: null, points: null }],
    }).map((i) => i.message);
    expect(messages.length).toBeGreaterThanOrEqual(6);
    for (const m of messages) expect(m).not.toMatch(/expected|received|invalid/i);
  });

  it('lý do bắt buộc 10–500 ký tự', () => {
    expect(pathsOf(validValues({ reason: '' }))).toContain('reason');
    expect(pathsOf(validValues({ reason: 'ngắn' }))).toContain('reason');
    expect(pathsOf(validValues({ reason: '   mười   ' }))).toContain('reason'); // trim rồi mới đếm
    expect(pathsOf(validValues({ reason: 'x'.repeat(501) }))).toContain('reason');
    expect(issuesOf(validValues({ reason: 'x'.repeat(500) }))).toEqual([]);
  });
});

describe('rules-form.utils', () => {
  it('toPutPayload: đúng các khoá BE `.strict()` cho phép — bộ luật BỎ `version`, có expectedVersion + reason; luật dùng `id` (không phải `ruleId`)', () => {
    const payload = toPutPayload(validValues(), 3);
    expect(Object.keys(payload).sort()).toEqual([
      'expectedVersion',
      'levels',
      'reason',
      'rules',
      'windowDays',
    ]);
    expect(payload.expectedVersion).toBe(3);
    expect(payload.rules).toEqual(makeRules().rules);
    expect(Object.keys(payload.rules[0]).sort()).toEqual([
      'aggregate',
      'days',
      'id',
      'label',
      'metric',
      'op',
      'points',
      'threshold',
    ]);
  });

  it('rulesToFormValues: lý do luôn để trống (phải nhập lại cho mỗi lần lưu)', () => {
    expect(rulesToFormValues(makeRules()).reason).toBe('');
  });

  it('hasRulesChanges: giống bản lưu → false (kể cả gõ lý do); đổi ngưỡng/điểm/thứ tự/số luật → true', () => {
    const rules = makeRules();
    expect(hasRulesChanges(rules, validValues())).toBe(false);
    const v = validValues();
    expect(hasRulesChanges(rules, { ...v, windowDays: 8 })).toBe(true);
    expect(hasRulesChanges(rules, { ...v, levels: { ...v.levels, medium: 41 } })).toBe(true);
    expect(
      hasRulesChanges(rules, { ...v, rules: [{ ...v.rules[0], points: 31 }, ...v.rules.slice(1)] }),
    ).toBe(true);
    expect(hasRulesChanges(rules, { ...v, rules: [...v.rules].reverse() })).toBe(true);
    expect(hasRulesChanges(rules, { ...v, rules: v.rules.slice(1) })).toBe(true);
  });

  it('nextRuleId: `custom-1`, `custom-2`… nhỏ nhất chưa dùng, luôn khớp ^[a-z0-9-]+$ và ≤ 40 ký tự', () => {
    expect(nextRuleId([])).toBe('custom-1');
    expect(nextRuleId(['custom-1', 'x'])).toBe('custom-2');
    expect(nextRuleId(['custom-1', 'custom-3'])).toBe('custom-2');
    const id = nextRuleId(Array.from({ length: 19 }, (_, i) => `custom-${i + 1}`));
    expect(id).toBe('custom-20');
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id.length).toBeLessThanOrEqual(RULE_LIMITS.idMax);
  });

  it('newRuleRow: nhãn trống (bắt buộc nhập), số ngày không vượt cửa sổ', () => {
    expect(newRuleRow([], 7)).toMatchObject({ ruleId: 'custom-1', label: '', days: 7 });
    expect(newRuleRow([], 3).days).toBe(3);
    expect(newRuleRow([], 0).days).toBe(1);
    expect(newRuleRow([], Number.NaN).days).toBe(7);
  });
});

describe('overview.utils', () => {
  it('parseOverviewWeeks: chỉ 4/8/12, ngoài ra → 12', () => {
    expect(parseOverviewWeeks('4')).toBe(4);
    expect(parseOverviewWeeks('8')).toBe(8);
    for (const bad of ['', 'x', '0', '13', '99', '-4', '4.5'])
      expect(parseOverviewWeeks(bad)).toBe(12);
  });

  it('formatApprox thêm "≈"; formatAlertCount: null → "—", 0 → "0"', () => {
    expect(formatApprox(1200)).toBe('≈ 1.200');
    expect(formatAlertCount(null)).toBe('—');
    expect(formatAlertCount(0)).toBe('0');
    expect(formatAlertCount(12)).toBe('12');
  });

  it('hasAlerts: ô che (null) nghĩa là CÓ cảnh báo; hasSuppressedCell nhận ra ô che', () => {
    const week = (alerts: number | null) => ({ weekStart: '2026-09-21', alerts });
    expect(hasAlerts([week(0), week(0)])).toBe(false);
    expect(hasAlerts([week(0), week(null)])).toBe(true);
    expect(hasAlerts([week(0), week(5)])).toBe(true);
    expect(hasSuppressedCell([week(0), week(5)])).toBe(false);
    expect(hasSuppressedCell([week(null)])).toBe(true);
  });

  it('toLevelRows: tỉ lệ trên tổng các nhóm đang công bố, giữ thứ tự; rỗng không chia 0', () => {
    const rows = toLevelRows([
      { level: 'LOW', count: 75 },
      { level: 'OTHER', count: 25 },
    ]);
    expect(rows.map((r) => [r.level, r.share])).toEqual([
      ['LOW', 75],
      ['OTHER', 25],
    ]);
    expect(toLevelRows([{ level: 'LOW', count: 0 }])[0].share).toBe(0);
    expect(toLevelRows([])).toEqual([]);
  });
});

describe('wellbeing-errors', () => {
  it('isVersionConflict chỉ đúng với RES_003', () => {
    expect(isVersionConflict(axiosError(409, 'RES_003', 'lệch phiên bản'))).toBe(true);
    expect(isVersionConflict(axiosError(409, 'RES_004', 'trùng'))).toBe(false);
    expect(isVersionConflict(new Error('x'))).toBe(false);
  });

  const fakeForm = () => {
    const setError = vi.fn();
    const form = {
      setError,
      getValues: () => validValues().rules,
    } as unknown as UseFormReturn<BurnoutRulesFormValues>;
    return { form, setError };
  };

  it('WELL_004 → ô Mức cao, dùng thông điệp của BE', () => {
    const { form, setError } = fakeForm();
    applyRulesServerErrors(
      form,
      axiosError(400, 'WELL_004', 'Ngưỡng mức cao phải lớn hơn mức trung bình'),
    );
    expect(setError).toHaveBeenCalledWith('levels.high', {
      type: 'server',
      message: 'Ngưỡng mức cao phải lớn hơn mức trung bình',
    });
  });

  it('WELL_003 → ô Số ngày (hoặc Tên luật khi trùng mã) của luật được nêu theo `ruleId`; luật lạ và phần tử sai dạng bị bỏ qua', () => {
    const { form, setError } = fakeForm();
    applyRulesServerErrors(
      form,
      axiosError(400, 'WELL_003', 'Cấu hình luật không hợp lệ', {
        issues: [
          {
            code: 'RULE_DAYS_EXCEED_WINDOW',
            message: 'Luật nhìn xa quá',
            ruleId: 'late-night-events',
          },
          { code: 'DUPLICATE_RULE_ID', message: 'Mã bị trùng', ruleId: 'high-daily-activity' },
          {
            code: 'RULE_DAYS_EXCEED_WINDOW',
            message: 'Luật không có trong form',
            ruleId: 'khong-co',
          },
          { code: 'X' },
          'sai-dang',
        ],
      }),
    );
    expect(setError.mock.calls).toEqual([
      ['rules.1.days', { type: 'server', message: 'Luật nhìn xa quá' }],
      ['rules.2.label', { type: 'server', message: 'Mã bị trùng' }],
    ]);
  });

  it('VAL_001 có details.reason → ô lý do; lỗi khác không gắn gì', () => {
    const { form, setError } = fakeForm();
    applyRulesServerErrors(
      form,
      axiosError(400, 'VAL_001', 'Dữ liệu không hợp lệ', { reason: ['Lý do quá ngắn'] }),
    );
    expect(setError).toHaveBeenCalledWith('reason', { type: 'server', message: 'Lý do quá ngắn' });

    const other = fakeForm();
    applyRulesServerErrors(other.form, axiosError(500, 'SYS_001', 'Lỗi máy chủ'));
    expect(other.setError).not.toHaveBeenCalled();
  });
});

describe('nhãn dùng chung đã có sẵn (điều phối viên thêm — bài kiểm chỉ xác nhận, không thêm trùng)', () => {
  it('mã lỗi WELL_003/WELL_004, nhãn hành động `wellbeing.rules-update` và đối tượng `BurnoutRules`', () => {
    expect(ERROR_CODE_MESSAGES.WELL_003).toBe('Cấu hình luật không hợp lệ');
    expect(ERROR_CODE_MESSAGES.WELL_004).toBe('Ngưỡng mức cao phải lớn hơn mức trung bình');
    expect(auditActionLabel('wellbeing.rules-update')).not.toBe('wellbeing.rules-update');
    expect(auditTargetTypeLabel('BurnoutRules')).not.toBe('BurnoutRules');
  });
});
