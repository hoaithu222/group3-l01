import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Đọc `error.details` của một lỗi backend — bản sao TỐI GIẢN của
 * `channels/utils/error-details.ts` (luật "không import chéo feature",
 * `feature-structure.md`, cùng lý do `idempotency-key.ts` đã ghi).
 */
export function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}

/** Mã lỗi nghiệp vụ (`CONV_013`…), `undefined` khi không đọc được. */
export function getErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const body = error.response?.data as ApiErrorBody | undefined;
  return body?.error?.code;
}
