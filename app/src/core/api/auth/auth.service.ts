import type { AuthUser } from '@/shell/store/slices/auth';

import { apiClient } from '../client';
import { unwrapData } from '../unwrap';
import { accountAuthService } from './account.service';
import { AUTH_ENDPOINTS } from './auth.api';
import { fetchNonce, withFreshNonce } from './auth.nonce';
import { normalize, persistSession } from './auth.session-helpers';
import { biometricAuthService } from './biometric.service';
import { emailVerificationAuthService } from './email-verification.service';
import { logoutAuthService } from './logout.service';
import { passwordAuthService } from './password.service';
import { profileAuthService } from './profile.service';
import { sessionAuthService } from './session.service';
import { socialAuthService } from './social.service';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  LoginResponse,
  NormalizedSession,
  RegisterPayload,
  ResetPasswordPayload,
} from './auth.types';

/**
 * Tầng gọi API xác thực.
 *
 * Đây là nơi DUY NHẤT biết backend đặt tên trường ra sao. Mọi thứ phía trên chỉ
 * thấy `NormalizedSession`, nên khi backend đổi từ `access_token` sang
 * `accessToken` (đã xảy ra) thì chỉ file này phải sửa.
 *
 * ⚠️ Sinh trắc học, đăng nhập mạng xã hội, "Phiên đăng nhập", "Xoá tài khoản/Quyền riêng tư", đăng xuất, đổi mật
 * khẩu và nonce tách ra các file cùng thư mục để file này dưới trần 150 dòng — gộp lại vào
 * `authService` bằng spread nên nơi gọi không thấy khác biệt gì.
 */
export const authService = {
  ...biometricAuthService,
  ...sessionAuthService,
  ...accountAuthService,
  ...emailVerificationAuthService,
  ...logoutAuthService,
  ...passwordAuthService,
  ...profileAuthService,
  ...socialAuthService,

  async login(payload: LoginPayload): Promise<NormalizedSession> {
    /**
     * ⛔ Nonce lấy TRƯỚC (`withFreshNonce`), và nếu lượt lấy này hỏng thì `login()` NÉM LỖI ngay
     * tại đây — `mutation.error` ở `useLogin` nhận đúng lỗi đó để hiện dưới ô nhập, KHÔNG rơi
     * xuống `POST /auth/login` với một nonce rỗng/thiếu. Nonce bị từ chối (`AUTH_018`) thì tự
     * lấy nonce khác và thử lại ĐÚNG MỘT LẦN.
     */
    const response = await withFreshNonce((nonce) =>
      apiClient.post<LoginResponse>(
        AUTH_ENDPOINTS.LOGIN,
        { ...payload, nonce },
        {
          /**
           * ⛔ BẮT BUỘC. Sai mật khẩu trả về 401; không có cờ này thì interceptor
           * tưởng phiên hết hạn và đi làm mới token — trong khi chưa hề có phiên
           * nào.
           */
          skipAuthRefresh: true,
          /** Sai mật khẩu là chuyện thường — màn đăng nhập tự hiện lỗi dưới ô nhập. */
          skipErrorToast: true,
        },
      ),
    );

    const session = normalize(unwrapData<LoginResponse>(response));
    await persistSession(session);
    return session;
  },

  async register(payload: RegisterPayload): Promise<NormalizedSession | null> {
    const response = await withFreshNonce((nonce) =>
      apiClient.post<LoginResponse>(
        AUTH_ENDPOINTS.REGISTER,
        { ...payload, nonce },
        { skipAuthRefresh: true, skipErrorToast: true },
      ),
    );

    const session = normalize(unwrapData<LoginResponse>(response));
    // Nhiều backend bắt xác thực e-mail trước, nên đăng ký xong CHƯA có token.
    // Đó không phải lỗi — trả `null` để màn hình biết mà chuyển sang bước sau.
    if (!session.accessToken) return null;

    await persistSession(session);
    return session;
  },

  /** Export lại để `useBiometricLogin` gọi trực tiếp — xem `auth.nonce.ts`. */
  fetchNonce,

  /**
   * Hồ sơ người dùng hiện tại. Dùng để dựng lại phiên sau khi refresh.
   * `timeoutMs`: lúc KHỞI ĐỘNG phải có trần ngắn — mặc định `apiTimeout` 30 giây là kẹt màn hình chờ.
   */
  async me(options: { timeoutMs?: number } = {}): Promise<AuthUser> {
    const response = await apiClient.get<AuthUser>(AUTH_ENDPOINTS.ME, {
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    });
    return unwrapData<AuthUser>(response);
  },

  /**
   * ⛔ `skipErrorToast`: lỗi (429, sai định dạng…) hiện ngay TRONG form qua `errorMessage`.
   * Thiếu cờ này là lỗi hiện HAI lần — toast của interceptor cộng dải `Alert` của màn hình.
   */
  async forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.FORGOT_PASSWORD, payload, {
      skipAuthRefresh: true,
      skipErrorToast: true,
    });
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.RESET_PASSWORD, payload, {
      skipAuthRefresh: true,
      skipErrorToast: true,
    });
  },
};
