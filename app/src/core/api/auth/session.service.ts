import { apiClient } from '../client';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS, sessionPath } from './auth.api';
import type { SessionSummary } from './auth.types';

/**
 * Hai thao tác API của màn "Phiên đăng nhập" (p0-01 mục 10, mở từ
 * `me/settings`) — tách khỏi `auth.service.ts` để giữ file đó dưới trần 150
 * dòng, cùng lối tách với `biometric.service.ts` ngay cạnh đây.
 *
 * `auth.service.ts` gộp object này vào `authService` bằng spread, nên nơi gọi
 * (`authService.listSessions(...)`) không thấy khác biệt gì so với trước khi
 * tách file.
 */
export const sessionAuthService = {
  /** Danh sách phiên ĐANG HOẠT ĐỘNG của chính người gọi — `GET /auth/sessions`. */
  async listSessions(): Promise<SessionSummary[]> {
    const response = await apiClient.get<SessionSummary[]>(AUTH_ENDPOINTS.SESSIONS);
    return unwrapData<SessionSummary[]>(response);
  },

  /**
   * Thu hồi MỘT phiên — `DELETE /auth/sessions/:id`.
   *
   * ⛔ KHÔNG set `skipErrorToast`: khác `revokeBiometricCredential` (best-effort,
   * caller tự nuốt lỗi), ở đây lỗi (mạng, hoặc ca hiếm phiên vừa thành
   * `isCurrent` giữa lúc màn hình render và lúc bấm) phải tới tai người dùng —
   * để interceptor tự hiện toast chung là đủ, màn hình không cần xử lý riêng.
   * Ca `isCurrent` bình thường không xảy ra vì UI đã tự ẩn nút cho phiên đó.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.delete(sessionPath(sessionId));
  },
};
