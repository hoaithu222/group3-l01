import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

export interface ErrorInfo {
  /** Mã HTTP; `undefined` khi không có phản hồi (mất mạng). */
  status?: number;
  /** Mã nghiệp vụ BE (`INV_006`…); `undefined` khi không có thân lỗi có cấu trúc. */
  code?: string;
  /** `error.details` của BE (vd `{ reason: 'EMAIL_MISMATCH' }`). */
  details?: Record<string, unknown>;
  /** Giây phải chờ trước khi thử lại — header `Retry-After` của 429. */
  retryAfterSeconds?: number;
}

/**
 * Đọc mã HTTP/mã nghiệp vụ/`details` từ MỘT lỗi bất kỳ.
 *
 * Nhận `unknown` vì `mutation.error` của React Query không có kiểu `AxiosError`
 * (`api-patterns.md`: ⛔ đừng ép `as AxiosError`). Cùng ý `getErrorDetails` của
 * `channels`, nhưng khai ĐỘC LẬP — không import chéo feature.
 */
export function readErrorInfo(error: unknown): ErrorInfo {
  if (!isAxiosError(error)) return {};

  const body = error.response?.data as ApiErrorBody | undefined;
  const details = body?.error?.details;
  const retryAfter = Number(error.response?.headers?.['retry-after']);

  return {
    status: error.response?.status,
    code: body?.error?.code ?? body?.errorCode ?? body?.ErrorCode,
    details: details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined,
  };
}
