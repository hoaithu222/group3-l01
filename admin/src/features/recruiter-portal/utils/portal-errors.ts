import type { AxiosError } from 'axios';

import { extractErrorCode, extractErrorDetails } from '@/core/api/error.handler';

import { PORTAL_ERROR } from '../constants/portal.constants';
import type { QuotaExceededDetails } from '../types/offer.types';

export const errorCodeOf = (err: unknown): string => extractErrorCode(err as AxiosError);

export const errorStatusOf = (err: unknown): number | undefined =>
  (err as AxiosError | null | undefined)?.response?.status;

/** `404 CFG_005`: cờ `career` hoặc công tắc `recruiter.enabled` đang tắt — khác "chưa thuộc doanh nghiệp nào" (cũng 404). */
export const isFeatureDisabledError = (err: unknown): boolean =>
  errorCodeOf(err) === PORTAL_ERROR.featureDisabled;

/** 404 KHÔNG phải `CFG_005`: người này chưa thuộc doanh nghiệp nào (`GET /me/company`). */
export const isNoCompanyError = (err: unknown): boolean =>
  errorStatusOf(err) === 404 && !isFeatureDisabledError(err);

/** `details` của `429 RECR_005` — `{ period, used, quota }`; thiếu/sai dạng → `null` (vẫn hiện thông điệp chung). */
export function quotaDetailsOf(err: unknown): QuotaExceededDetails | null {
  const d = extractErrorDetails(err as AxiosError) as Partial<QuotaExceededDetails> | null;
  if (!d || typeof d.quota !== 'number' || typeof d.used !== 'number') return null;
  return { period: typeof d.period === 'string' ? d.period : '', used: d.used, quota: d.quota };
}

/** `details.retryAfterSeconds` của `429 RECR_010` (giới hạn xem hồ sơ/ngày); thiếu → `null`. */
export function retryAfterSecondsOf(err: unknown): number | null {
  const d = extractErrorDetails(err as AxiosError) as { retryAfterSeconds?: unknown } | null;
  const s = d?.retryAfterSeconds;
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? Math.ceil(s) : null;
}

/** Đồng hồ đếm ngược `m:ss` / `h:mm:ss` tới 0. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
