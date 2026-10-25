/**
 * Tầng gọi API.
 *
 *   client.ts        — thực thể axios + interceptor (token, refresh 401, toast lỗi)
 *   client.types.ts  — kiểu mở rộng cho request/response
 *   client.helpers.ts— hàm phụ trợ cho interceptor
 *   error.handler.ts — bóc thông điệp lỗi từ nhiều dạng payload của BE
 *   session.ts       — refresh phiên (single-flight), điểm DUY NHẤT trong core chạm auth store
 *   auth/            — module API đăng nhập
 */

export { apiClient } from './client';
export type { ApiErrorResponse, RequestConfig } from './client.types';
export { extractErrorMessage, isErrorHandled } from './error.handler';
export * from './auth';
