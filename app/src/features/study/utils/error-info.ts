import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

import type { BulkErrorDetail } from '../api/study.types';
import { STUDY_ERROR_MESSAGES } from '../constants/study-error-codes.constants';

/** Mã lỗi BE (`error.code`) hoặc `undefined` khi không phải lỗi có cấu trúc. */
export function getErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const body = error.response?.data as ApiErrorBody | undefined;
  return body?.error?.code;
}

export function getHttpStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** `error.details` của lỗi BE (đối tượng, ví dụ `RES_003 { currentVersion }`). */
export function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  return details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

/** `details` DẠNG MẢNG của `400 STUDY_001` — mỗi phần tử một lỗi mục có `index`. */
export function getBulkErrorDetails(error: unknown): BulkErrorDetail[] {
  if (!isAxiosError(error)) return [];
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details as unknown;
  if (!Array.isArray(details)) return [];
  return details.filter(
    (entry): entry is BulkErrorDetail =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as BulkErrorDetail).index === 'number',
  );
}

/** Mã lỗi BE mà màn soạn/tạo phân nhánh theo. */
export const STUDY_ERROR = {
  BULK_INVALID: 'STUDY_001',
  HIDDEN: 'STUDY_004',
  ITEMS_MAX: 'STUDY_002',
  PUBLIC_UNCONFIRMED: 'STUDY_008',
  SETS_MAX: 'STUDY_007',
  VERSION_CONFLICT: 'RES_003',
  WORKSPACE_REQUIRED: 'STUDY_003',
} as const;

/** Câu lỗi cho màn thi thử / ôn theo lịch: mã `MOCK_*`/`SR_*` tra bảng feature, còn lại như `toErrorMessage`. */
export function studyErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  return (code && STUDY_ERROR_MESSAGES[code]) || toErrorMessage(error);
}
