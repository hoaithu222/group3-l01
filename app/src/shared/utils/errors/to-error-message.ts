import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Câu lỗi cho người dùng — MỘT nơi (p0-12).
 *
 * `toErrorMessage(error)` ĐÃ có ở `core/api/client.helpers.ts` (đọc `error.code` của BE → bảng
 * `shared/constants/error-codes` → câu theo mã HTTP → "Có lỗi xảy ra…"; mất mạng/quá giờ có câu riêng) và được dùng khắp
 * app — không viết bản thứ hai, chỉ re-export để nơi gọi mới có MỘT đường nhập cho cả bộ (câu lỗi + đọc mã/trạng thái +
 * `Retry-After`). Đọc thêm ở `client.helpers.ts` để biết thứ tự ưu tiên của các dạng payload.
 */
export { toErrorMessage } from '@/core/api/client.helpers';

function bodyOf(error: unknown): ApiErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined) : undefined;
}

/** Mã lỗi nghiệp vụ của BE (`error.code`, kể cả dạng gateway `errorCode`); `undefined` khi không phải lỗi có cấu trúc. */
export function errorCodeOf(error: unknown): string | undefined {
  const body = bodyOf(error);
  return body?.error?.code ?? body?.errorCode ?? body?.ErrorCode;
}

/** Mã HTTP của phản hồi lỗi; `undefined` khi không có phản hồi (mất mạng, quá giờ) hoặc không phải lỗi axios. */
export function httpStatusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** Lỗi do KHÔNG tới được máy chủ (mất mạng, quá giờ) — thử lại khi có sóng chữa được, khác hẳn 4xx/5xx. */
export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}

/**
 * Số giây phải chờ khi bị giới hạn tốc độ (429): `error.details.retryAfterSeconds` của BE (`RATE_*`), nếu thiếu thì
 * header `Retry-After` (số giây). Làm tròn LÊN; `undefined` khi không phải 429 hoặc không có số hợp lệ (> 0).
 * Kết quả đưa thẳng vào `useRetryCountdown().start()`.
 */
export function retryAfterSecondsOf(error: unknown): number | undefined {
  if (httpStatusOf(error) !== 429) return undefined;

  const details = bodyOf(error)?.error?.details;
  const fromBody =
    details && typeof details === 'object'
      ? (details as { retryAfterSeconds?: unknown }).retryAfterSeconds
      : undefined;
  const header = isAxiosError(error)
    ? (error.response?.headers as Record<string, unknown> | undefined)?.['retry-after']
    : undefined;

  for (const candidate of [fromBody, typeof header === 'string' ? Number(header) : header]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0)
      return Math.ceil(candidate);
  }
  return undefined;
}
