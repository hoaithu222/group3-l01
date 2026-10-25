import { isAxiosError } from 'axios';
import type { UseFormReturn } from 'react-hook-form';

import {
  extractErrorCode,
  extractErrorDetails,
  extractErrorMessage,
} from '@/core/api/error.handler';

import type { BurnoutRulesFormValues } from '../schemas/burnout-rules.schema';

/** Mã lỗi BE (`error.code`) của một lỗi axios; `''` khi không phải lỗi axios / không có mã. */
function errorCodeOf(err: unknown): string {
  if (!isAxiosError(err)) return '';
  const code = extractErrorCode(err);
  return code === 'UNKNOWN' ? '' : code;
}

export const errorStatusOf = (err: unknown): number | undefined =>
  isAxiosError(err) ? err.response?.status : undefined;

/** `RES_003` — bộ luật đã bị sửa ở nơi khác (CAS `expectedVersion` lệch) → phải tải lại trước khi lưu. */
export const isVersionConflict = (err: unknown): boolean => errorCodeOf(err) === 'RES_003';

interface RuleIssue {
  code?: string;
  message: string;
  ruleId?: string;
}

/** `WELL_003` kèm `details.issues[] { code, message, ruleId? }` (`DUPLICATE_RULE_ID`, `RULE_DAYS_EXCEED_WINDOW`). Bỏ phần tử sai dạng. */
function readIssues(err: unknown): RuleIssue[] {
  if (!isAxiosError(err)) return [];
  const details = extractErrorDetails(err);
  const raw: unknown =
    details !== null && typeof details === 'object'
      ? (details as { issues?: unknown }).issues
      : undefined;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).flatMap((item) => {
    if (item === null || typeof item !== 'object') return [];
    const { code, message, ruleId } = item as {
      code?: unknown;
      message?: unknown;
      ruleId?: unknown;
    };
    if (typeof message !== 'string') return [];
    return [
      {
        message,
        ...(typeof code === 'string' && { code }),
        ...(typeof ruleId === 'string' && { ruleId }),
      },
    ];
  });
}

/** `VAL_001` — thông điệp đầu tiên của ô `reason` trong `error.details` (BE từ chối chính lý do). */
function reasonMessage(err: unknown): string | null {
  if (!isAxiosError(err) || errorCodeOf(err) !== 'VAL_001') return null;
  const details = extractErrorDetails(err);
  if (details === null || typeof details !== 'object') return null;
  const raw = (details as { reason?: unknown }).reason;
  const first: unknown = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : null;
}

/**
 * Gắn lỗi BE vào ĐÚNG ô của form sửa bộ luật (toast chung của interceptor vẫn hiện): `WELL_004` → ô "Mức cao"; `WELL_003` → ô "Số ngày" (hoặc "Tên luật" khi trùng mã) của luật bị nêu theo `ruleId`,
 * luật không tìm thấy trong form thì bỏ qua; `VAL_001` có `details.reason` → ô lý do. Chỉ là chốt phụ — client đã chặn các lỗi này trước khi gửi.
 */
export function applyRulesServerErrors(
  form: UseFormReturn<BurnoutRulesFormValues>,
  err: unknown,
): void {
  const code = errorCodeOf(err);
  if (code === 'WELL_004' && isAxiosError(err)) {
    form.setError('levels.high', { type: 'server', message: extractErrorMessage(err) });
    return;
  }
  if (code === 'WELL_003') {
    const rows = form.getValues('rules');
    for (const issue of readIssues(err)) {
      const index = issue.ruleId ? rows.findIndex((r) => r.ruleId === issue.ruleId) : -1;
      if (index < 0) continue;
      const field = issue.code === 'DUPLICATE_RULE_ID' ? 'label' : 'days';
      form.setError(`rules.${index}.${field}`, { type: 'server', message: issue.message });
    }
    return;
  }
  const reason = reasonMessage(err);
  if (reason) form.setError('reason', { type: 'server', message: reason });
}
