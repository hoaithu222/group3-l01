import { apiClient } from '../client';
import { getRefreshToken, purgeSession } from '../session';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS } from './auth.api';
import type { LogoutAllResult } from './auth.types';

/**
 * Chờ tối đa bấy nhiêu cho `POST /auth/logout`. Người dùng bấm "Đăng xuất" thường vì sắp đưa máy
 * cho người khác; trước đây lượt gọi này dùng `apiTimeout` 30 giây nên mất sóng là kẹt cả nửa phút.
 */
const LOGOUT_STEP_TIMEOUT_MS = 3000;

export const logoutAuthService = {
  /**
   * Đăng xuất.
   *
   * ⛔ Dọn phiên phía client DÙ lời gọi tới máy chủ có hỏng hay không (`finally`). Người dùng
   * bấm "Đăng xuất" là họ muốn thoát; để lỗi mạng chặn lại là phiên còn sống trên một cái máy
   * đã sang tay.
   *
   * ⛔ PHẢI gửi `refreshToken` trong body. Trước đây không gửi gì, mà BE chỉ đọc refresh
   * token từ cookie (web) hoặc `body.refreshToken` (app) — app không có cookie nên phiên phía
   * máy chủ KHÔNG BAO GIỜ bị thu hồi: refresh token bị đánh cắp vẫn dùng được 7 ngày sau khi
   * đăng xuất, và phiên vẫn hiện trong "Phiên đăng nhập".
   *
   * BE (rà soát auth 2026-09-25) cho `POST /auth/logout` chạy bằng CHỈ refresh token — access token
   * là tuỳ chọn (`optionalAuth` bỏ qua token hết hạn) — nên KHÔNG làm mới token trước: đỡ một vòng
   * mạng khi đã mất sóng, và không xoay vòng token chỉ để rồi thu hồi nó.
   */
  async logout(): Promise<void> {
    try {
      const refreshToken = await getRefreshToken();
      await apiClient.post(AUTH_ENDPOINTS.LOGOUT, refreshToken ? { refreshToken } : undefined, {
        skipAuthRefresh: true,
        skipErrorToast: true,
        timeout: LOGOUT_STEP_TIMEOUT_MS,
      });
    } catch {
      // Cố ý nuốt — xem chú thích trên.
    } finally {
      await purgeSession();
    }
  },

  /**
   * Đăng xuất MỌI thiết bị (`POST /auth/logout-all`) — BE thu hồi mọi phiên + đăng nhập sinh trắc học + push token, tăng
   * `sessionVersion` (mọi access token cũ chết ngay, kể cả token đang cầm) rồi ngắt socket.
   *
   * ⛔ KHÁC `logout()` ở HAI điểm, đều cố ý:
   *  · KHÔNG dọn phiên phía client ở đây. Lượt gọi hỏng (mất mạng, 429) thì người dùng PHẢI còn nguyên phiên để bấm lại —
   *    nuốt lỗi rồi dọn như `logout()` là báo "đã đăng xuất khỏi mọi nơi" trong khi máy khác vẫn đăng nhập. Nơi gọi
   *    (`useLogoutAll`) chỉ dọn SAU khi BE xác nhận.
   *  · Đi bằng access token (không có nhánh refresh token trần) và KHÔNG `skipAuthRefresh`: token vừa hết hạn thì 401 được
   *    làm mới rồi phát lại như mọi request khác. Lỗi (429 vượt hạn mức thao tác tài khoản…) để interceptor toast MỘT LẦN.
   */
  async logoutAll(): Promise<LogoutAllResult> {
    const response = await apiClient.post<LogoutAllResult>(AUTH_ENDPOINTS.LOGOUT_ALL);
    const result = unwrapData<Partial<LogoutAllResult> | null>(response);
    return {
      revokedSessions: typeof result?.revokedSessions === 'number' ? result.revokedSessions : 0,
    };
  },
};
