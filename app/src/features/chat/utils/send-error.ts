import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

export interface SendErrorInfo {
  /** `undefined` = lỗi MẠNG/timeout (không có response) — ca `RECONCILE` của app.md §4.3. */
  code?: string;
  message: string;
  /** Epoch ms — chỉ có khi `code === 'RATE_002'` (429, `ScopeRateLimitError.details.retryAfterSeconds`). */
  retryAfterAt?: number;
  /** `MSG_008 details.invalidMentions[].targetId` — chip nào server từ chối (composer tô đỏ). */
  invalidMentionUserIds?: string[];
}

/**
 * Gửi lại Y NGUYÊN payload không bao giờ khỏi: `MSG_008` (đích nhắc tên sai/không còn quyền đọc) và
 * `MSG_020` (không được `@all` ở đây) — chỉ SỬA nội dung (bỏ chip) rồi gửi bản mới mới qua được.
 * Ẩn nút "Thử lại" ở các mã này, để lại "Sửa"/"Xoá bản chờ".
 */
const NON_RETRYABLE_CODES = new Set(['MSG_008', 'MSG_020']);
export function isRetryableSendCode(code: string | undefined): boolean {
  return code === undefined || !NON_RETRYABLE_CODES.has(code);
}

function readInvalidMentionUserIds(details: unknown): string[] | undefined {
  const list = (details as { invalidMentions?: { targetId?: string | null }[] } | undefined)?.invalidMentions;
  if (!Array.isArray(list)) return undefined;
  return list.flatMap((item) => (typeof item?.targetId === 'string' ? [item.targetId] : []));
}

/** Phân loại lỗi gửi tin — tách khỏi `useSendMessage.ts` để hook giữ dưới trần dòng. */
export function classifySendError(error: unknown): SendErrorInfo {
  if (!isAxiosError(error) || !error.response) {
    return { message: toErrorMessage(error) };
  }
  const code = getErrorCode(error);
  const body = error.response.data as ApiErrorBody | undefined;
  const details = body?.error?.details as { retryAfterSeconds?: number } | undefined;
  const retryAfterAt =
    error.response.status === 429 && typeof details?.retryAfterSeconds === 'number'
      ? Date.now() + details.retryAfterSeconds * 1000
      : undefined;
  const invalidMentionUserIds = code === 'MSG_008' ? readInvalidMentionUserIds(body?.error?.details) : undefined;
  return { code, message: toErrorMessage(error), retryAfterAt, invalidMentionUserIds };
}
