import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

export type SearchErrorKind =
  /** 404 (`PERM_404`/`RES_001`) — mất quyền đọc phạm vi: rời màn, không hiện nội dung. */
  | 'no-access'
  /** 429 (`RATE_002`) — đếm ngược `retryAfterSeconds` rồi tự thử lại. */
  | 'rate-limited'
  | 'other';

export interface SearchErrorInfo {
  kind: SearchErrorKind;
  /** Mã lỗi của BE (`SRCH_104`, `CFG_005`…) khi có — nơi gọi tự ánh xạ sang câu riêng của feature. */
  code?: string;
  /** Câu tiếng Việt: `SRCH_*`/`VAL_*`… theo bảng mã lỗi chung, mất mạng → câu "kiểm tra kết nối". */
  message: string;
  /** Chỉ có khi `kind === 'rate-limited'`. */
  retryAfterSeconds?: number;
}

/** `RATE_002` mặc định — BE luôn kèm `details.retryAfterSeconds` nhưng đừng để nút "thử lại" treo vô hạn nếu thiếu. */
const DEFAULT_RETRY_SECONDS = 10;

/**
 * Phân loại lỗi của lượt tìm (tìm trong kênh p1-09 và tìm toàn nhóm p5-04 dùng chung). Nâng từ `discovery` lên `shared/`
 * vì hai feature không được import chéo nhau.
 */
export function describeSearchError(error: unknown): SearchErrorInfo {
  const message = toErrorMessage(error);
  if (!isAxiosError(error)) return { kind: 'other', message };

  const status = error.response?.status;
  const code = getErrorCode(error);
  const base = code ? { code } : {};
  if (status === 404 || code === 'PERM_404' || code === 'RES_001')
    return { ...base, kind: 'no-access', message };
  if (status === 429) {
    const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details as
      { retryAfterSeconds?: unknown } | undefined;
    const seconds = Number(details?.retryAfterSeconds);
    return {
      ...base,
      kind: 'rate-limited',
      message,
      retryAfterSeconds:
        Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_SECONDS,
    };
  }
  return { ...base, kind: 'other', message };
}
