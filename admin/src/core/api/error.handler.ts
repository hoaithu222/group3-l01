/**
 * @file error.handler.ts
 * @description Đọc và xử lý BE error format mới:
 *   { success: false, error: { code, message, details }, timestamp, requestId }
 */

import { isAxiosError, type AxiosError } from 'axios';
import type { ApiResponse } from '@/shared/types';
import { ERROR_CODE_MESSAGES, HTTP_STATUS_MESSAGES } from '@/shared/constants/error-codes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lấy message lỗi từ BE error format, fallback theo status hoặc message chung. */
export function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data as (ApiResponse & { Message?: string }) | undefined;

  // BE structured error
  if (data?.error?.message) {
    return data.error.message;
  }

  // Flat key (.NET Pascal-case `Message` hoặc lowercase `message`)
  const flatKey = data?.Message ?? data?.message;
  if (flatKey?.trim()) {
    return flatKey.trim();
  }

  // HTTP status fallback
  const status = error.response?.status;
  if (status && HTTP_STATUS_MESSAGES[status]) {
    return HTTP_STATUS_MESSAGES[status];
  }

  // Network / unknown
  if (!error.response) {
    return 'Không thể kết nối đến máy chủ, vui lòng kiểm tra mạng';
  }

  return error.message || 'Đã xảy ra lỗi không xác định';
}

/**
 * Lấy error code từ BE error format (ví dụ: "AUTH_001").
 *
 * Đọc CẢ HAI dạng, giống `extractErrorMessage` ở trên:
 *   - có bọc:  { success: false, error: { code } }
 *   - phẳng:   { status: false, errorCode } — dạng .NET gateway trả kèm HTTP 2xx
 * Thiếu nhánh phẳng thì mọi lỗi nghiệp vụ của gateway đều ra "UNKNOWN", nên
 * caller không phân biệt nổi "không tìm thấy" với "hết quyền".
 */
export function extractErrorCode(error: AxiosError): string {
  const data = error.response?.data as
    (ApiResponse & { errorCode?: string; ErrorCode?: string }) | undefined;
  return data?.error?.code ?? data?.errorCode ?? data?.ErrorCode ?? 'UNKNOWN';
}

/** Lấy message tiếng Việt từ error code. */
export function getMessageByCode(code: string): string {
  return ERROR_CODE_MESSAGES[code] ?? 'Đã xảy ra lỗi không xác định';
}

/** Lấy details (field-level validation errors) nếu có. */
export function extractErrorDetails(error: AxiosError): unknown {
  const data = error.response?.data as ApiResponse | undefined;
  return data?.error?.details ?? null;
}

/**
 * Lỗi do MẠNG hoặc MÁY CHỦ chứ không phải do dữ liệu người dùng: không có phản
 * hồi (đứt mạng, timeout, bị huỷ), 408, 502/503/504, hoặc 401 mà việc làm mới token
 * cũng không hỏi được máy chủ (`sessionUnavailable`, gắn bởi `client.refresh.ts`).
 *
 * Dùng để chọn thông điệp "kiểm tra kết nối" thay vì "sai thông tin", và để quyết
 * định có cảnh báo "phiên chưa được thu hồi trên máy chủ" khi đăng xuất hay không.
 */
export function isConnectivityError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if ((error as { sessionUnavailable?: boolean }).sessionUnavailable) return true;
  const status = error.response?.status;
  return status === undefined || status === 408 || (status >= 502 && status <= 504);
}

/**
 * Số giây phải chờ theo header `Retry-After` của 429; `null` nếu không có/không đọc được.
 * Header này chỉ đọc được khi cùng origin hoặc BE `exposedHeaders` — cấu hình chuẩn của
 * admin (nginx cùng domain) là cùng origin, nên có.
 */
export function extractRetryAfterSeconds(error: AxiosError): number | null {
  const raw: unknown = error.response?.headers?.['retry-after'];
  const seconds = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Kiểm tra error đã được axios response interceptor toast (cờ `__toastShown`).
 * Dùng trong React Query `onError` để tránh hiển thị toast trùng — chỉ show
 * thêm khi interceptor chưa xử lý (vd request có `skipErrorToast: true`).
 */
export function isErrorHandled(error: unknown): boolean {
  return Boolean((error as { __toastShown?: boolean } | null | undefined)?.__toastShown);
}
