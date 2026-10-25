import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Nhãn lỗi p4-06 — đặt TRONG feature: `shared/constants/error-codes.ts` đã chạm trần. Câu của BE (`error.message`) cũng đã là
 * tiếng Việt; bảng này bảo đảm app không phụ thuộc vào câu chữ phía server và có câu dịch khi thân lỗi thiếu `message`.
 */
export const CONTRIBUTION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CONTRIB_001: 'Bảng đóng góp chỉ để xem, không thể chỉnh sửa.',
  CONTRIB_002: 'Tổng trọng số phải bằng 100.',
  CONTRIB_003: 'Kỳ báo cáo không hợp lệ.',
  CONTRIB_004: 'Khoảng ngày của biểu đồ hoạt động vượt giới hạn cho phép.',
  CONTRIB_005: 'Tệp báo cáo đã hết hạn, hãy xuất lại.',
  CONTRIB_006: 'Báo cáo đang được tạo, vui lòng chờ.',
};

function bodyOf(error: unknown): ApiErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined) : undefined;
}

/** Mã lỗi nghiệp vụ của BE (`error.code`), `undefined` khi không phải lỗi có cấu trúc. */
export function errorCodeOf(error: unknown): string | undefined {
  const body = bodyOf(error);
  return body?.error?.code ?? body?.errorCode ?? body?.ErrorCode;
}

export function httpStatusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

function detailsOf(error: unknown): Record<string, unknown> | undefined {
  const details = bodyOf(error)?.error?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}

/** Câu tiếng Việt cho một lỗi bất kỳ: mã `CONTRIB_*` tra bảng của feature, còn lại theo `toErrorMessage` chung. */
export function contributionErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  return (code ? CONTRIBUTION_ERROR_MESSAGES[code] : undefined) ?? toErrorMessage(error);
}

/** `RES_003` — công thức vừa bị người khác đổi (CAS `expectedVersion` lệch): tải lại rồi lưu tiếp. */
export function isVersionConflict(error: unknown): boolean {
  return httpStatusOf(error) === 409 && errorCodeOf(error) === 'RES_003';
}

/** Số giây phải chờ khi bị giới hạn tốc độ (`429`, `details.retryAfterSeconds`); `undefined` khi không phải 429 hay thiếu số. */
export function retryAfterSeconds(error: unknown): number | undefined {
  if (httpStatusOf(error) !== 429) return undefined;
  const seconds = detailsOf(error)?.retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

/** Nhóm lỗi "không còn xem được" (khách, người ngoài, bảng đã xoá): thử lại vẫn 403/404, nên không có nút "Thử lại". */
export function isAccessLost(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 403 || status === 404;
}

/** Tệp xuất đã hết hạn (`410 CONTRIB_005`). */
export function isExportExpired(error: unknown): boolean {
  return httpStatusOf(error) === 410 || errorCodeOf(error) === 'CONTRIB_005';
}
