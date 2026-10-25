import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

/** Mã lỗi backend (`error.code`) hoặc `undefined` khi không phải lỗi có cấu trúc. */
export function getErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const body = error.response?.data as ApiErrorBody | undefined;
  return body?.error?.code ?? body?.errorCode ?? body?.ErrorCode;
}

/** `error.details` của lỗi backend — `TASK_007 { columnId, taskCount }`, `RES_003 { current }`. */
export function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}

export function getHttpStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}
