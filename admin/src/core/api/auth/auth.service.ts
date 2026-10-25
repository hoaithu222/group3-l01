/**
 * Hàm gọi Auth API — async thuần, KHÔNG biết React / React Query / store.
 *
 * ⛔ HỢP ĐỒNG TRẢ VỀ (theo `api-patterns.md`): mọi hàm trả `ApiResponse<T>`,
 * tức chỗ gọi đọc `res.data`. `ApiResponse.data` là BẮT BUỘC — interceptor đã
 * chặn mọi phản hồi lỗi từ trước, nên tới đây luôn có payload, không cần `?.`.
 *
 *   const res = await authService.login(payload);
 *   setAuth({ user: res.data.user, token: res.data.accessToken });
 *
 * Dùng làm `mutationFn` / `queryFn` ở tầng feature:
 *   useMutation({ mutationFn: authService.login })
 *
 * ⛔ Refresh KHÔNG có ở đây — chỉ `refreshSession()` (`@/core/api/session`) được gọi
 * `/auth/refresh`, để mọi lượt refresh (interceptor, khôi phục phiên lúc F5, socket)
 * đều qua MỘT single-flight và MỘT khoá liên tab.
 */
import type { RequestConfig } from '@/core/api/client.types';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types';
import { getOrCreateDeviceId } from '@/shared/utils/browser';
import { authApi } from './auth.api';
import { FORM_AUTH_REQUEST, withNonce } from './auth.nonce';
import { ensureFreshAccessToken } from '@/core/api/session';
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  User,
} from './auth.types';

/**
 * Cờ form + `X-Device-Id` (định danh trình duyệt bền, cùng giá trị socket gửi).
 * BE dùng nó để nhận ra "đã đăng nhập từ trình duyệt này rồi" — không có nó thì cảnh
 * báo "đăng nhập từ thiết bị mới" bám vào cặp User-Agent + IP và báo động giả mỗi
 * lần đổi mạng/VPN. KHÔNG phải định danh bảo mật.
 */
const withDevice = (config: RequestConfig): RequestConfig => ({
  ...config,
  headers: { ...config.headers, 'X-Device-Id': getOrCreateDeviceId() },
});

export const authService = {
  /**
   * POST /auth/login — đăng nhập bằng email + mật khẩu.
   * BE set cookie refresh (HttpOnly) ngay trong response này; FE chỉ nhận
   * `accessToken` để giữ trong bộ nhớ.
   *
   * Nonce lấy ngay trước; BE từ chối nonce (`AUTH_018`) thì lấy nonce khác và thử lại
   * đúng một lần — xem `withNonce`. Sai mật khẩu là 401 nhưng KHÔNG kích refresh
   * (`FORM_AUTH_REQUEST` + `AUTH_NO_REFRESH_PATHS`).
   */
  login: (data: LoginRequest): Promise<ApiResponse<LoginResponse>> =>
    withNonce(
      async (nonce) =>
        (
          await apiClient.post<ApiResponse<LoginResponse>>(
            authApi.login,
            { ...data, nonce },
            withDevice(FORM_AUTH_REQUEST),
          )
        ).data,
    ),

  /** POST /auth/register — tạo tài khoản, trả về giống `login`. */
  register: (data: RegisterRequest): Promise<ApiResponse<RegisterResponse>> =>
    withNonce(
      async (nonce) =>
        (
          await apiClient.post<ApiResponse<RegisterResponse>>(
            authApi.register,
            { ...data, nonce },
            withDevice(FORM_AUTH_REQUEST),
          )
        ).data,
    ),

  /**
   * POST /auth/logout — thu hồi phiên phía máy chủ, BE xoá cookie refresh.
   *
   * Endpoint này nằm sau `authenticateToken`: access token đã hết hạn thì BE không thu
   * hồi được phiên bằng cookie. Vì thế KHÔNG khai `skipAuthRefresh` — 401 sẽ để interceptor
   * làm mới token rồi phát lại. Người gọi (`useLogout`) tự quyết có báo lỗi hay không.
   */
  logout: async (): Promise<ApiResponse<null>> =>
    (
      await apiClient.post<ApiResponse<null>>(
        authApi.logout,
        undefined,
        withDevice({ skipErrorToast: true } as RequestConfig),
      )
    ).data,

  /** GET /auth/me — hồ sơ + vai trò + quyền của người đang đăng nhập. */
  me: async (): Promise<ApiResponse<User>> =>
    (await apiClient.get<ApiResponse<User>>(authApi.me)).data,

  /**
   * POST /auth/forgot-password — gửi email đặt lại mật khẩu.
   * BE phải trả kết quả GIỐNG NHAU dù email có tồn tại hay không, nếu không
   * endpoint này thành công cụ dò xem ai đã đăng ký (user enumeration).
   */
  forgotPassword: async (data: ForgotPasswordRequest): Promise<ApiResponse<null>> =>
    (await apiClient.post<ApiResponse<null>>(authApi.forgotPassword, data, FORM_AUTH_REQUEST)).data,

  /** POST /auth/reset-password — đặt mật khẩu mới bằng token nhận qua email. */
  resetPassword: async (data: ResetPasswordRequest): Promise<ApiResponse<null>> =>
    (await apiClient.post<ApiResponse<null>>(authApi.resetPassword, data, FORM_AUTH_REQUEST)).data,

  /**
   * PATCH /auth/change-password — đổi mật khẩu của chính mình.
   *
   * 401 ở đây nghĩa "mật khẩu hiện tại sai" (không phải token hết hạn) nên endpoint nằm
   * trong `AUTH_NO_REFRESH_PATHS`; đổi lại, làm mới token CHỦ ĐỘNG trước khi gửi để token
   * hết hạn không bị báo nhầm là sai mật khẩu.
   *
   * Response mang access token MỚI của phiên hiện tại — người gọi phải nhận lấy (xem
   * `ChangePasswordResponse`); hàm này không chạm store. `data` có thể `null` với BE bản cũ
   * (FE/BE triển khai độc lập) — đổi mật khẩu vẫn thành công, chỉ là không có token mới.
   */
  changePassword: async (
    data: ChangePasswordRequest,
  ): Promise<ApiResponse<ChangePasswordResponse | null>> => {
    await ensureFreshAccessToken();
    return (
      await apiClient.patch<ApiResponse<ChangePasswordResponse | null>>(
        authApi.changePassword,
        data,
        FORM_AUTH_REQUEST,
      )
    ).data;
  },
};
