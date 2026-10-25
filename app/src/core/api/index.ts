/**
 * Tầng gọi API.
 *
 *   client.ts         — thực thể axios + interceptor (token, refresh 401, toast lỗi)
 *   client.types.ts   — cờ mở rộng cho request + hình dạng lỗi của backend
 *   client.helpers.ts — dịch lỗi sang tiếng Việt, che dữ liệu nhạy cảm khi log
 *   client.refresh.ts — hàng đợi phát lại request sau khi làm mới token
 *   session.ts        — vòng đời phiên; ĐIỂM DUY NHẤT trong core chạm auth store và kho khoá
 *   unwrap.ts         — bóc lớp bọc `{ data }` của backend .NET
 *   auth/             — module API đăng nhập
 */

export { apiClient } from './client';
export {
  getApiErrorMessage,
  getErrorCode,
  getErrorMessage,
  isErrorHandled,
  toErrorMessage,
} from './client.helpers';
export { getAccessToken, purgeSession, refreshSession } from './session';
export type { RefreshOutcome } from './session';
export { onSessionEnded } from './session-end';
export type { SessionEndInfo, SessionEndListener } from './session-end';
export { ensureFreshAccessToken } from './session.fresh';
export { unwrapData } from './unwrap';
export type { ApiEnvelope, ApiErrorBody, Paginated } from './client.types';
export * from './auth';
