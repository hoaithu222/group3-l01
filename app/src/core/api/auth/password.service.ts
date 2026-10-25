import { apiClient } from '../client';
import { ensureFreshAccessToken } from '../session.fresh';
import { unwrapData } from '../unwrap';
import { AUTH_ENDPOINTS } from './auth.api';
import { UserFacingError } from './auth-errors';
import type { ChangePasswordPayload, ChangePasswordResult } from './auth.types';

/** Không làm mới được token trước lượt xác nhận mật khẩu — câu này hiện thẳng cho người dùng. */
export const SESSION_NOT_READY_MESSAGE =
  'Chưa xác nhận được phiên đăng nhập. Kiểm tra kết nối rồi thử lại.';

/**
 * Đổi mật khẩu (p0-01 mục 10) — tách khỏi `auth.service.ts` (file đó chạm trần 150 dòng),
 * gộp vào `authService` bằng spread cùng lối `account.service.ts`.
 */
export const passwordAuthService = {
  /**
   * `PATCH /auth/change-password` — người dùng ĐÃ đăng nhập xác nhận bằng mật khẩu hiện tại.
   *
   * ⛔ `skipAuthRefresh` + làm mới token TRƯỚC (`ensureFreshAccessToken`): BE trả 401 cho cả
   * "mật khẩu hiện tại sai" lẫn "token hết hạn". Để interceptor tự xử thì gõ sai mật khẩu là
   * làm mới → phát lại → 401 lần hai → DỌN PHIÊN, người dùng bị đá ra ngoài. Token đã chắc
   * chắn còn hạn thì 401 ở đây chỉ có thể là sai mật khẩu.
   *
   * `skipErrorToast`: lỗi thuộc về form, hiện ngay dưới ô nhập chứ không phải toast 4 giây.
   */
  async changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResult> {
    if (!(await ensureFreshAccessToken())) throw new UserFacingError(SESSION_NOT_READY_MESSAGE);

    const response = await apiClient.patch<ChangePasswordResult>(
      AUTH_ENDPOINTS.CHANGE_PASSWORD,
      payload,
      { skipAuthRefresh: true, skipErrorToast: true },
    );
    const result = unwrapData<Partial<ChangePasswordResult> | null>(response);
    return {
      revokedSessions: typeof result?.revokedSessions === 'number' ? result.revokedSessions : 0,
      ...(result?.accessToken ? { accessToken: result.accessToken } : {}),
    };
  },
};
