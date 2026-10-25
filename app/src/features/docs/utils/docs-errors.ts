import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import { DOCS_ERROR_MESSAGES } from '../constants/docs.constants';

interface ErrorBody {
  error?: { code?: string };
}

/** Mã lỗi BE (`DOC_005`, `RES_003`…) — chỗ UI RẼ NHÁNH theo mã; `null` khi không đọc được. */
export function docsErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  return (error.response?.data as ErrorBody | undefined)?.error?.code ?? null;
}

export function httpStatusOf(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/** Câu tiếng Việt: ưu tiên nhãn `DOC_*` của feature, còn lại dùng bộ dịch chung (mạng, 500…). */
export function docsErrorMessage(error: unknown): string {
  const code = docsErrorCode(error);
  return (code && DOCS_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/** 404 (tài liệu ẩn/không còn/không có quyền — BE trả 404 trung tính) hoặc cờ `collab` tắt (`CFG_005`). */
export function isNotAvailable(error: unknown): boolean {
  return httpStatusOf(error) === 404 || docsErrorCode(error) === 'CFG_005';
}

/** 409 `RES_003`: `expectedVersion` lệch — tài liệu vừa đổi ở nơi khác. */
export function isVersionConflict(error: unknown): boolean {
  return docsErrorCode(error) === 'RES_003';
}
