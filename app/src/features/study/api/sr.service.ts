import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  SrDueResult,
  SrEnrollResult,
  SrReviewPayload,
  SrReviewResult,
  SrSummary,
} from './sr.types';

/** Endpoint SR (be `sr.routes.ts`): `/sr/enrollments`, `/sr/due`, `/sr/review`, `/sr/summary`. */
export const SR_ENROLLMENTS_PATH = '/sr/enrollments';
export const SR_DUE_PATH = '/sr/due';
export const SR_REVIEW_PATH = '/sr/review';
export const SR_SUMMARY_PATH = '/sr/summary';

/** Ghi lỗi (`SR_001/002/003`) là nội dung màn ôn — tự xử lý, không toast chung. */
export const srService = {
  async due(setId?: string): Promise<SrDueResult> {
    const response = await apiClient.get<SrDueResult>(SR_DUE_PATH, {
      params: setId ? { setId } : undefined,
      skipErrorToast: true,
    });
    return unwrapData<SrDueResult>(response);
  },

  async summary(setId?: string): Promise<SrSummary> {
    const response = await apiClient.get<SrSummary>(SR_SUMMARY_PATH, {
      params: setId ? { setId } : undefined,
      skipErrorToast: true,
    });
    return unwrapData<SrSummary>(response);
  },

  /** Idempotent theo `clientReviewId` — gửi lại cùng id không ghi hai lần. */
  async review(payload: SrReviewPayload): Promise<SrReviewResult> {
    const response = await apiClient.post<SrReviewResult>(SR_REVIEW_PATH, payload, {
      skipErrorToast: true,
    });
    return unwrapData<SrReviewResult>(response);
  },

  async enroll(setId: string, newPerDay?: number): Promise<SrEnrollResult> {
    const response = await apiClient.post<SrEnrollResult>(
      SR_ENROLLMENTS_PATH,
      newPerDay === undefined ? { setId } : { newPerDay, setId },
      { skipErrorToast: true },
    );
    return unwrapData<SrEnrollResult>(response);
  },

  async unenroll(setId: string): Promise<void> {
    await apiClient.delete(`${SR_ENROLLMENTS_PATH}/${setId}`);
  },
};
