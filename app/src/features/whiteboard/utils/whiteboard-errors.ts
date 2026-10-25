import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import { WB_ERROR_MESSAGES } from '../constants/whiteboard.constants';

interface ErrorBody {
  error?: { code?: string };
}

/** Mã lỗi BE (`WB_005`, `RES_003`…) — chỗ UI RẼ NHÁNH theo mã; `null` khi không đọc được. */
export function whiteboardErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  return (error.response?.data as ErrorBody | undefined)?.error?.code ?? null;
}

export function httpStatusOf(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/** Câu tiếng Việt: ưu tiên nhãn `WB_*` của feature, còn lại dùng bộ dịch chung (mạng, 500…). */
export function whiteboardErrorMessage(error: unknown): string {
  const code = whiteboardErrorCode(error);
  return (code && WB_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/** 404 (bảng ẩn/không còn/không có quyền — BE trả 404 trung tính) hoặc cờ `collab` tắt (`CFG_005`). */
export function isNotAvailable(error: unknown): boolean {
  return httpStatusOf(error) === 404 || whiteboardErrorCode(error) === 'CFG_005';
}

/** 409 `RES_003`: `expectedVersion` lệch — bảng vừa đổi ở nơi khác. */
export function isVersionConflict(error: unknown): boolean {
  return whiteboardErrorCode(error) === 'RES_003';
}
